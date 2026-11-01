'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '@/config/supabase';
import { labelShort, todayISO } from '@/lib/dates';
import { fmtMoney } from '@/lib/format';
import { adminDb, type AdminOrder } from '@/lib/admin/client';
import { dayEditable, previewPortions, PORTIONS_MAX, PORTIONS_MIN } from '@/lib/admin/portions';
import { tgLabel } from '@/lib/admin/telegram-link';
import { Btn, Err } from './ui';

const ERR: Record<string, string> = {
  forbidden: 'Нет прав на изменение заказа.',
  not_found: 'Заказ не найден (возможно, удалён).',
  order_cancelled: 'Заказ отменён — менять порции нельзя.',
  day_locked: 'Один из дней уже прошёл, сегодняшний или доставлен — его менять нельзя. Обновите список.',
  bad_qty: `Порций должно быть от ${PORTIONS_MIN} до ${PORTIONS_MAX}.`,
  no_changes: 'Порции не изменились.',
};

const diffText = (d: number) => (d > 0 ? `доплата ${fmtMoney(d)}` : d < 0 ? `возврат ${fmtMoney(-d)}` : 'без доплаты');

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={title} className="max-h-[90vh] w-full max-w-[460px] overflow-y-auto rounded-md2 bg-card p-4 shadow-lg">
        <div className="mb-3 text-[17px] font-extrabold">{title}</div>
        {children}
      </div>
    </div>
  );
}

/** Кнопка «Изменить порции» + окно правки по дням + окно подтверждения. Сохранение — edge-функция `change-portions` (RPC с is_admin()). */
export function PortionsEditor({ o, onChanged, onNotice }: { o: AdminOrder; onChanged: () => void; onNotice?: (s: string) => void }) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [qtys, setQtys] = useState<Record<number, number>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const cancelRef = useRef<HTMLButtonElement>(null);
  const days = [...o.order_days].sort((a, b) => a.delivery_date.localeCompare(b.delivery_date));
  const today = todayISO();
  const editable = days.filter((d) => dayEditable(d, today));

  useEffect(() => {
    if (confirm) cancelRef.current?.focus();
  }, [confirm]);

  const start = () => {
    setQtys(Object.fromEntries(days.map((d) => [d.id, d.qty])));
    setError('');
    setConfirm(false);
    setOpen(true);
  };
  const close = () => {
    if (busy) return;
    setOpen(false);
    setConfirm(false);
  };
  const clamp = (n: number) => Math.min(PORTIONS_MAX, Math.max(PORTIONS_MIN, n));
  const setOne = (id: number, n: number) => setQtys((q) => ({ ...q, [id]: clamp(n) }));
  const applyAll = (n: number) => setQtys((q) => ({ ...q, ...Object.fromEntries(editable.map((d) => [d.id, n])) }));

  const pv = previewPortions(o, qtys);
  const changed = days.filter((d) => (qtys[d.id] ?? d.qty) !== d.qty);

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      const { data } = await adminDb.auth.getSession();
      const res = await fetch(`${SUPABASE_URL}/functions/v1/change-portions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${data.session?.access_token ?? ''}` },
        body: JSON.stringify({ id: o.id, days: changed.map((d) => ({ id: d.id, qty: qtys[d.id] })) }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) {
        setConfirm(false);
        setError(ERR[body.code] ?? 'Не удалось изменить заказ. Попробуйте ещё раз.');
      } else {
        setOpen(false);
        setConfirm(false);
        onNotice?.(
          `Заказ ${o.order_number}: ${body.old_portions} → ${body.new_portions} порций, ${diffText(body.diff)}.` +
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

  if (o.status === 'cancelled' || editable.length === 0) return null;

  return (
    <>
      <Btn kind="ghost" className="!min-h-9 !px-3 !text-sm" onClick={start}>
        Изменить порции
      </Btn>
      {open && !confirm && (
        <Modal title={`Порции в заказе ${o.order_number}`} onClose={close}>
          <div className="flex flex-col gap-2">
            {days.map((d) => {
              const ok = dayEditable(d, today);
              const v = qtys[d.id] ?? d.qty;
              return (
                <div key={d.id} className={`flex items-center justify-between gap-2 rounded-chip border border-line px-3 py-1.5 ${ok ? '' : 'bg-sand text-ink-muted'}`}>
                  <div className="text-sm">
                    {labelShort(d.delivery_date, 'ru')}
                    {!ok && <span className="ml-1 text-xs">{d.delivered ? '· доставлен' : d.delivery_date === today ? '· сегодня' : '· прошёл'}</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <button type="button" aria-label="Меньше" disabled={!ok || v <= PORTIONS_MIN} onClick={() => setOne(d.id, v - 1)} className="h-9 w-9 rounded-chip border border-line text-lg font-extrabold disabled:opacity-40">−</button>
                    <span className="w-6 text-center text-base font-extrabold">{v}</span>
                    <button type="button" aria-label="Больше" disabled={!ok || v >= PORTIONS_MAX} onClick={() => setOne(d.id, v + 1)} className="h-9 w-9 rounded-chip border border-line text-lg font-extrabold disabled:opacity-40">+</button>
                  </div>
                </div>
              );
            })}
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="text-ink-muted">Применить ко всем дням:</span>
              <div className="flex gap-1">
                {[1, 2, 3, 4].map((n) => (
                  <Btn key={n} kind="ghost" className="!min-h-9 !w-9 !px-0 !text-sm" onClick={() => applyAll(n)}>
                    {n}
                  </Btn>
                ))}
              </div>
            </div>
            <div className="mt-1 rounded-chip bg-sand p-3 text-sm">
              <div>Порций: {pv.oldPortions} → <b>{pv.newPortions}</b></div>
              <div>Сумма: {fmtMoney(pv.oldTotal)} → <b>{fmtMoney(pv.newTotal)}</b></div>
              <div className={`font-extrabold ${pv.diff > 0 ? 'text-danger' : pv.diff < 0 ? 'text-success' : 'text-ink-muted'}`}>{diffText(pv.diff)}</div>
              <div className="mt-1 text-xs text-ink-muted">Цена обеда как в заказе{o.discount_percent > 0 ? `, скидка ${o.discount_percent}%` : ''}; доставка не меняется.</div>
            </div>
            <Err>{error}</Err>
            <div className="flex gap-2">
              <Btn className="flex-1" disabled={changed.length === 0} onClick={() => setConfirm(true)}>Сохранить</Btn>
              <Btn kind="ghost" onClick={close}>Закрыть</Btn>
            </div>
          </div>
        </Modal>
      )}
      {open && confirm && (
        <Modal title="Подтвердите изменение" onClose={close}>
          <div
            className="flex flex-col gap-3"
            onKeyDown={(e) => {
              // Enter и Escape = отмена; подтверждает только явный клик по кнопке.
              if (e.key === 'Enter' || e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                close();
              }
            }}
          >
            <div className="text-sm leading-relaxed">
              Заказ <b>{o.order_number}</b>, клиент <b>{tgLabel(o.telegram)}</b>:
              <ul className="my-1 list-disc pl-5">
                {changed.map((d) => (
                  <li key={d.id}>{labelShort(d.delivery_date, 'ru')}: {d.qty} → <b>{qtys[d.id]}</b></li>
                ))}
              </ul>
              было <b>{pv.oldPortions}</b> → станет <b>{pv.newPortions}</b> порций, {diffText(pv.diff)}.
              <div className="text-ink-muted">Сумма заказа: {fmtMoney(pv.oldTotal)} → {fmtMoney(pv.newTotal)}</div>
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
