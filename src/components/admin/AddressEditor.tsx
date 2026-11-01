'use client';

import { useEffect, useRef, useState } from 'react';
import { PLACES_DEBOUNCE_MS, PLACES_MIN_CHARS } from '@/config/google';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '@/config/supabase';
import { labelShort, todayISO } from '@/lib/dates';
import { adminDb, type AdminOrder } from '@/lib/admin/client';
import { autocomplete, newSessionToken, placeDetails, type PlaceInfo, type Suggestion } from '@/lib/places';
import { tgLabel } from '@/lib/admin/telegram-link';
import { Btn, Err, inputCls, Label } from './ui';
import { Modal } from './PortionsEditor';

interface Other {
  id: string;
  order_number: string;
  address: string;
  days: string[];
}

const ERR: Record<string, string> = {
  forbidden: 'Нет прав на изменение заказа.',
  not_found: 'Заказ не найден (возможно, удалён).',
  order_not_active: 'Заказ не активен (отменён или доставлен).',
  no_future_days: 'У заказа нет будущих недоставленных дней.',
  other_client: 'Выбранный заказ принадлежит другому клиенту.',
  bad_address: 'Проверьте адрес.',
  bad_comment: 'Комментарий слишком длинный.',
};

const futureDays = (o: { order_days: { delivery_date: string; delivered: boolean }[] }, today: string) =>
  o.order_days.filter((d) => !d.delivered && d.delivery_date > today).map((d) => d.delivery_date).sort();

/** Поле адреса с подсказками Google Places (те же запросы и ограничения Дананга, что на сайте; язык русский). */
function AddressInput({ value, onText, onPlace }: { value: string; onText: (v: string) => void; onPlace: (p: PlaceInfo) => void }) {
  const [items, setItems] = useState<Suggestion[]>([]);
  const typed = useRef(false);
  const token = useRef(newSessionToken());

  useEffect(() => {
    const q = value.trim();
    if (!typed.current || q.length < PLACES_MIN_CHARS) return setItems([]);
    const ctl = new AbortController();
    const timer = setTimeout(async () => {
      const res = await autocomplete(q, token.current, 'ru', ctl.signal);
      if (!ctl.signal.aborted) setItems(res);
    }, PLACES_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      ctl.abort();
    };
  }, [value]);

  const pick = async (s: Suggestion) => {
    typed.current = false;
    setItems([]);
    const info = await placeDetails(s.placeId, token.current, 'ru');
    token.current = newSessionToken();
    if (info) onPlace(info);
    else onText([s.main, s.secondary].filter(Boolean).join(', '));
  };

  return (
    <div className="relative">
      <input
        className={inputCls}
        value={value}
        placeholder="Начните вводить адрес"
        autoComplete="off"
        onChange={(e) => {
          typed.current = true;
          onText(e.target.value);
        }}
      />
      {items.length > 0 && (
        <ul className="absolute inset-x-0 top-[calc(100%+4px)] z-30 overflow-hidden rounded-chip border border-line bg-card shadow-seg">
          {items.map((s) => (
            <li key={s.placeId}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => void pick(s)} className="flex w-full flex-col gap-0.5 border-b border-line px-3 py-2 text-left last:border-b-0 hover:bg-sand">
                <span className="text-[15px] font-bold leading-tight">{s.main}</span>
                {s.secondary && <span className="text-xs leading-tight text-ink-muted">{s.secondary}</span>}
              </button>
            </li>
          ))}
          <li className="px-3 py-1 text-right text-[10px] text-ink-muted">Powered by Google</li>
        </ul>
      )}
    </div>
  );
}

/** «Изменить адрес»: поле с подсказками Google, комментарий, галочка «ко всем активным заказам клиента», окно подтверждения. Сохранение — edge-функция `change-address` (RPC с is_admin()). */
export function AddressEditor({ o, onChanged, onNotice }: { o: AdminOrder; onChanged: () => void; onNotice?: (s: string) => void }) {
  const today = todayISO();
  const mine = futureDays(o, today);
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [address, setAddress] = useState('');
  const [place, setPlace] = useState<PlaceInfo | null>(null);
  const [comment, setComment] = useState('');
  const [others, setOthers] = useState<Other[]>([]);
  const [useOthers, setUseOthers] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (confirm) cancelRef.current?.focus();
  }, [confirm]);

  const start = async () => {
    setAddress(o.address);
    setPlace(null);
    setComment(o.comment ?? '');
    setUseOthers(true);
    setError('');
    setConfirm(false);
    setOthers([]);
    setOpen(true);
    const like = o.telegram.trim().replace(/[\\%_]/g, (c) => `\\${c}`);
    const { data } = await adminDb
      .from('orders')
      .select('id, order_number, address, order_days(delivery_date, delivered)')
      .ilike('telegram', like)
      .in('status', ['new', 'confirmed'])
      .neq('id', o.id);
    setOthers(
      ((data ?? []) as unknown as { id: string; order_number: string; address: string; order_days: { delivery_date: string; delivered: boolean }[] }[])
        .map((x) => ({ id: x.id, order_number: x.order_number, address: x.address, days: futureDays(x, today) }))
        .filter((x) => x.days.length > 0),
    );
  };
  const close = () => {
    if (busy) return;
    setOpen(false);
    setConfirm(false);
  };

  const chosen = useOthers ? others : [];
  const targets: Other[] = [{ id: o.id, order_number: o.order_number, address: o.address, days: mine }, ...chosen];
  const addressChanged = address.trim() !== o.address.trim();
  const commentChanged = comment.trim() !== (o.comment ?? '').trim();
  const valid = address.trim().length >= 5 && (addressChanged || commentChanged);

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      const { data } = await adminDb.auth.getSession();
      const res = await fetch(`${SUPABASE_URL}/functions/v1/change-address`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${data.session?.access_token ?? ''}` },
        body: JSON.stringify({
          id: o.id,
          address: address.trim(),
          ...(place && place.text === address ? { place_id: place.placeId, lat: place.lat, lng: place.lng } : {}),
          comment: comment.trim(),
          also: chosen.map((x) => x.id),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) {
        setConfirm(false);
        setError(ERR[body.code] ?? 'Не удалось изменить адрес. Попробуйте ещё раз.');
      } else {
        setOpen(false);
        setConfirm(false);
        onNotice?.(
          `Адрес изменён: ${(body.orders as { order_number: string }[]).map((x) => x.order_number).join(', ')}.` +
            (body.point ? '' : ' Точку на карте определить не удалось — укажите её вручную.') +
            (body.telegram === 'failed' ? ' Сообщение в Telegram отправить не удалось.' : ''),
        );
        onChanged();
      }
    } catch {
      setConfirm(false);
      setError('Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.');
    } finally {
      setBusy(false);
    }
  };

  if (!['new', 'confirmed'].includes(o.status) || mine.length === 0) return null;

  return (
    <>
      <Btn kind="ghost" className="!min-h-9 !px-3 !text-sm" onClick={() => void start()}>
        Изменить адрес
      </Btn>
      {open && !confirm && (
        <Modal title={`Адрес доставки ${o.order_number}`} onClose={close}>
          <div className="flex flex-col gap-3">
            <div>
              <Label>Адрес</Label>
              <AddressInput value={address} onText={(v) => { setAddress(v); setPlace(null); }} onPlace={(p) => { setAddress(p.text); setPlace(p); }} />
              <div className="mt-1 text-xs text-ink-muted">{place && place.text === address ? 'Точка на карте выбрана из подсказки.' : 'Без выбора подсказки точку найдёт сервер по тексту.'}</div>
            </div>
            <div>
              <Label>Комментарий к адресу</Label>
              <input className={inputCls} value={comment} maxLength={500} onChange={(e) => setComment(e.target.value)} placeholder="этаж, домофон, как пройти" />
            </div>
            {others.length > 0 && (
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" className="mt-1 h-4 w-4" checked={useOthers} onChange={(e) => setUseOthers(e.target.checked)} />
                <span>
                  Применить ко всем активным заказам этого клиента: <b>{others.map((x) => x.order_number).join(', ')}</b>
                </span>
              </label>
            )}
            <div className="text-xs text-ink-muted">Меняются только заказы с будущими недоставленными днями. Адрес хранится на заказе целиком — карточка уже доставленных дней покажет новый адрес, прежний остаётся в журнале.</div>
            <Err>{error}</Err>
            <div className="flex gap-2">
              <Btn className="flex-1" disabled={!valid} onClick={() => setConfirm(true)}>Сохранить</Btn>
              <Btn kind="ghost" onClick={close}>Закрыть</Btn>
            </div>
          </div>
        </Modal>
      )}
      {open && confirm && (
        <Modal title="Подтвердите изменение адреса" onClose={close}>
          <div
            className="flex flex-col gap-3"
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                close();
              }
            }}
          >
            <div className="text-sm leading-relaxed">
              Клиент <b>{tgLabel(o.telegram)}</b>
              <div className="mt-1">Было: <span className="text-ink-muted">{o.address}</span></div>
              <div>Станет: <b>{address.trim()}</b></div>
              {commentChanged && <div className="mt-1">Комментарий: <span className="text-ink-muted">{o.comment || '—'}</span> → <b>{comment.trim() || '—'}</b></div>}
              <ul className="mt-2 list-disc pl-5">
                {targets.map((t) => (
                  <li key={t.id}>
                    <b>{t.order_number}</b>: {t.days.map((d) => labelShort(d, 'ru')).join(', ')}
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex gap-2">
              <button ref={cancelRef} type="button" autoFocus onClick={close} className="min-h-11 flex-1 rounded-md2 border-2 border-accent px-4 text-[15px] font-extrabold text-accent">
                Отмена
              </button>
              <Btn kind="ghost" disabled={busy} onClick={save}>{busy ? 'Сохраняем…' : 'Подтвердить'}</Btn>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
