'use client';

import { useEffect, useRef, useState } from 'react';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '@/config/supabase';
import { labelShort, todayISO } from '@/lib/dates';
import { adminDb, type AdminOrder } from '@/lib/admin/client';
import { tgLabel } from '@/lib/admin/telegram-link';
import { Btn, Err } from './ui';
import { Modal } from './PortionsEditor';

const ERR: Record<string, string> = {
  forbidden: 'Нет прав на восстановление заказа.',
  not_found: 'Заказ не найден (возможно, удалён).',
  not_cancelled: 'Заказ уже не отменён — обновите страницу.',
  no_future_days: 'Все дни заказа уже прошли — восстановить нельзя.',
};

/** Дни, которые ещё можно доставить: не доставлены и не раньше сегодня (по Дананг-времени). */
export const restorableDays = (o: AdminOrder, today = todayISO()) =>
  o.order_days.filter((d) => !d.delivered && d.delivery_date >= today).map((d) => d.delivery_date).sort();

/** «Восстановить» для отменённого заказа: окно подтверждения («Отмена» в фокусе; Enter, Esc, клик мимо = отмена), edge-функция `restore-order` (RPC с is_admin(), order_edits, уведомление в Orders). */
export function RestoreOrder({ o, onChanged, onNotice }: { o: AdminOrder; onChanged: () => void; onNotice?: (s: string) => void }) {
  const days = restorableDays(o);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) cancelRef.current?.focus();
  }, [open]);

  if (o.status !== 'cancelled' || days.length === 0) return null;

  const close = () => {
    if (!busy) setOpen(false);
  };
  const run = async () => {
    setBusy(true);
    setError('');
    try {
      const { data } = await adminDb.auth.getSession();
      const res = await fetch(`${SUPABASE_URL}/functions/v1/restore-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${data.session?.access_token ?? ''}` },
        body: JSON.stringify({ id: o.id }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) setError(ERR[body.code] ?? 'Не удалось восстановить заказ. Попробуйте ещё раз.');
      else {
        setOpen(false);
        onNotice?.(`Заказ ${o.order_number} восстановлен (подтверждён).${body.telegram === 'failed' ? ' Сообщение в Telegram обновить не удалось.' : ''}`);
        onChanged();
      }
    } catch {
      setError('Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Btn kind="ghost" className="!min-h-9 !px-3 !text-sm" onClick={() => { setError(''); setOpen(true); }}>
        ♻️ Восстановить
      </Btn>
      {open && (
        <Modal title="Восстановить заказ?" onClose={close}>
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
              Заказ <b>{o.order_number}</b> · <b>{tgLabel(o.telegram)}</b> вернётся в статус <b>«Подтверждён»</b>, все данные остаются как были.
              <div className="mt-1">Дни доставки: {days.map((d) => labelShort(d, 'ru')).join(', ')}</div>
              <div className="mt-1 text-ink-muted">В группу Orders уйдёт отметка о восстановлении.</div>
            </div>
            <Err>{error}</Err>
            <div className="flex gap-2">
              <button ref={cancelRef} type="button" autoFocus onClick={close} className="min-h-11 flex-1 rounded-md2 border-2 border-accent px-4 text-[15px] font-extrabold text-accent">
                Отмена
              </button>
              <Btn kind="ghost" disabled={busy} onClick={run}>{busy ? 'Восстанавливаем…' : 'Восстановить'}</Btn>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
