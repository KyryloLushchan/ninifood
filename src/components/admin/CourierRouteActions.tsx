'use client';

import { useEffect, useRef, useState } from 'react';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '@/config/supabase';
import { adminDb } from '@/lib/admin/client';
import { ruError } from '@/lib/admin/errors';
import { Btn } from './ui';
import { Modal } from './PortionsEditor';

/** Время отметки курьера по Дананг-времени, «ЧЧ:ММ». */
export const markTime = (iso: string) => new Intl.DateTimeFormat('ru-RU', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));

/** Окно подтверждения: «Отмена» в фокусе; Enter, Esc и клик мимо = отмена, подтверждает только клик. */
function Confirm({ title, children, action, busy, onRun, onClose }: { title: string; children: React.ReactNode; action: string; busy: boolean; onRun: () => void; onClose: () => void }) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => cancelRef.current?.focus(), []);
  const close = () => {
    if (!busy) onClose();
  };
  return (
    <Modal title={title} onClose={close}>
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
        <div className="text-sm leading-relaxed">{children}</div>
        <div className="flex gap-2">
          <button ref={cancelRef} type="button" autoFocus onClick={close} className="min-h-11 flex-1 rounded-md2 border-2 border-accent px-4 text-[15px] font-extrabold text-accent">
            Отмена
          </button>
          <Btn kind="ghost" disabled={busy} onClick={onRun}>{busy ? 'Выполняем…' : action}</Btn>
        </div>
      </div>
    </Modal>
  );
}

/**
 * Маршрут в группе курьера: «Закрыть все отмеченные курьером» (доставлено = как кнопка «Доставлено» у админа; статус заказа и кассу двигают триггеры БД)
 * и «Отправить маршрут курьеру сейчас» (edge-функция `courier-route`, republish: старые сообщения — «❌ Неактуально»). Оба — с подтверждением; viewer кнопок не видит (рисует вызывающий).
 */
export function CourierRouteActions({ date, markedIds, onChanged, onNotice, onError }: { date: string; markedIds: number[]; onChanged: () => void; onNotice: (s: string) => void; onError: (s: string) => void }) {
  const [ask, setAsk] = useState<null | 'close' | 'send'>(null);
  const [busy, setBusy] = useState(false);

  const closeMarked = async () => {
    setBusy(true);
    const { error } = await adminDb.from('order_days').update({ delivered: true }).in('id', markedIds).eq('delivered', false);
    setBusy(false);
    setAsk(null);
    if (error) onError(ruError(error.message));
    else {
      onNotice(`Закрыто доставок: ${markedIds.length}.`);
      onChanged();
    }
  };
  const sendRoute = async () => {
    setBusy(true);
    try {
      const { data } = await adminDb.auth.getSession();
      const res = await fetch(`${SUPABASE_URL}/functions/v1/courier-route`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${data.session?.access_token ?? ''}` },
        body: JSON.stringify({ action: 'republish', date }),
      });
      const body = await res.json().catch(() => ({}));
      setAsk(null);
      if (!res.ok || !body.ok) {
        onError(
          body.code === 'forbidden' ? 'Нет прав на отправку маршрута.' : body.code === 'chat_missing' ? 'Группа курьера не настроена (COURIER_CHAT_ID).' : body.code === 'kitchen_missing' ? 'Не заданы координаты кухни.' : 'Не удалось отправить маршрут. Попробуйте ещё раз.',
        );
      } else if (body.skipped === 'sunday') onNotice('Воскресенье — выходной, маршрут не отправляется.');
      else if (body.skipped === 'empty') onNotice('На эту дату нет доставок — маршрут не отправлен.');
      else onNotice(`Маршрут отправляется в группу курьера (сообщений: ${body.messages ?? '—'}); старые сообщения помечены «Неактуально».`);
    } catch (e) {
      setAsk(null);
      onError(ruError((e as Error).message));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="flex flex-col gap-3">
        {markedIds.length > 0 && (
          <Btn kind="primary" onClick={() => setAsk('close')}>
            ✅ Закрыть все отмеченные курьером ({markedIds.length})
          </Btn>
        )}
        <Btn kind="outline" className="lg:!px-3 lg:!text-sm" onClick={() => setAsk('send')}>
          Отправить маршрут курьеру сейчас
        </Btn>
      </div>
      {ask === 'close' && (
        <Confirm title="Закрыть отмеченные курьером?" action="Закрыть" busy={busy} onRun={closeMarked} onClose={() => setAsk(null)}>
          Доставок, которые курьер отметил в Telegram: <b>{markedIds.length}</b>. Они станут «доставлено» (как по кнопке «Доставлено»), заказы и касса обновятся.
        </Confirm>
      )}
      {ask === 'send' && (
        <Confirm title="Отправить маршрут курьеру?" action="Отправить" busy={busy} onRun={sendRoute} onClose={() => setAsk(null)}>
          Маршрут на <b>{date.split('-').reverse().join('.')}</b> уйдёт в группу «NiniFood Courier» заново: все прежние сообщения маршрута будут помечены «❌ Неактуально», точки придут новыми сообщениями с кнопками.
        </Confirm>
      )}
    </>
  );
}
