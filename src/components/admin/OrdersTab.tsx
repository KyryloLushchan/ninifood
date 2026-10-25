'use client';

import { useCallback, useEffect, useState } from 'react';
import { orderMessageUrl } from '@/config/site';
import { labelShort } from '@/lib/dates';
import { fmtMoney } from '@/lib/format';
import { adminDb, STATUS_LABEL, type AdminOrder, type OrderStatus } from '@/lib/admin/client';
import { tgHref, tgLabel } from '@/lib/admin/telegram-link';
import { Btn, Card, Err, Note, inputCls } from './ui';

const fmtCreated = (iso: string) =>
  new Intl.DateTimeFormat('ru', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

export function OrdersTab({ adminEmail }: { adminEmail: string }) {
  const [date, setDate] = useState('');
  const [status, setStatus] = useState<'' | OrderStatus>('');
  const [orders, setOrders] = useState<AdminOrder[] | null>(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError('');
    let ids: string[] | null = null;
    if (date) {
      const { data, error } = await adminDb.from('order_days').select('order_id').eq('delivery_date', date);
      if (error) return setError(error.message);
      ids = [...new Set((data ?? []).map((d) => d.order_id as string))];
    }
    let q = adminDb.from('orders').select('*, order_days(id, delivery_date, qty, delivered)').order('created_at', { ascending: false }).limit(100);
    if (status) q = q.eq('status', status);
    if (ids) q = q.in('id', ids);
    const { data, error } = await q;
    if (error) setError(error.message);
    else setOrders((data ?? []) as unknown as AdminOrder[]);
  }, [date, status]);

  useEffect(() => {
    setOrders(null);
    load();
  }, [load]);

  const setOrderStatus = async (o: AdminOrder, next: OrderStatus) => {
    const { error } = await adminDb
      .from('orders')
      .update({ status: next, status_changed_at: new Date().toISOString(), status_changed_by: adminEmail })
      .eq('id', o.id);
    if (error) setError(error.message);
    else load();
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} aria-label="Дата доставки" />
        <select value={status} onChange={(e) => setStatus(e.target.value as '' | OrderStatus)} className={inputCls} aria-label="Статус">
          <option value="">Все статусы</option>
          {(Object.keys(STATUS_LABEL) as OrderStatus[]).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        {date && <Btn kind="ghost" onClick={() => setDate('')}>✕</Btn>}
      </div>
      <Err>{error}</Err>
      {orders === null && <Note>Загрузка…</Note>}
      {orders?.length === 0 && <Note>Заказов нет</Note>}

      {orders?.map((o) => {
        const lost = o.tg_message_id === null;
        const isOpen = open === o.id;
        const days = [...o.order_days].sort((a, b) => a.delivery_date.localeCompare(b.delivery_date));
        const href = tgHref(o.telegram);
        return (
          <Card key={o.id} className={lost ? 'border-danger bg-danger-bg' : ''}>
            <button className="flex w-full items-start justify-between gap-3 text-left" onClick={() => setOpen(isOpen ? null : o.id)}>
              <div>
                <div className="text-[15px] font-extrabold">
                  {o.order_number} <span className="text-sm font-bold text-ink-muted">· {fmtCreated(o.created_at)}</span>
                </div>
                <div className="text-sm text-ink-2">
                  {o.type === 'single' ? 'Разовый' : 'Подписка'} · {days.length} дн. × {o.qty} · {o.payment_method === 'qr' ? 'QR' : 'наличные'}
                </div>
              </div>
              <div className="text-right">
                <div className="font-serif text-[17px] font-bold">{fmtMoney(o.total)}</div>
                <div className="text-xs font-extrabold text-accent">{STATUS_LABEL[o.status]}</div>
              </div>
            </button>
            {lost && <div className="mt-2 text-sm font-extrabold text-danger">⚠ Не дошёл в Telegram</div>}

            {isOpen && (
              <div className="mt-3 flex flex-col gap-1.5 border-t border-line pt-3 text-sm">
                <div>
                  <b>Telegram:</b>{' '}
                  {href ? (
                    <a href={href} target="_blank" rel="noreferrer">
                      {tgLabel(o.telegram)}
                    </a>
                  ) : (
                    tgLabel(o.telegram)
                  )}
                </div>
                <div><b>Адрес:</b> {o.address}</div>
                {o.hotel && <div><b>Отель:</b> {o.hotel}</div>}
                {o.comment && <div><b>Комментарий:</b> {o.comment}</div>}
                <div><b>Язык:</b> {(o.lang ?? '—').toUpperCase()}</div>
                <div>
                  <b>Дни:</b>
                  <ul className="mt-1 flex flex-col gap-0.5">
                    {days.map((d) => (
                      <li key={d.id}>
                        {d.delivered ? '✅' : '⬜'} {labelShort(d.delivery_date, 'ru')} · {d.qty} порц.
                      </li>
                    ))}
                  </ul>
                </div>
                {o.status_changed_by && (
                  <div className="text-ink-muted">
                    Статус изменил: {o.status_changed_by}
                    {o.status_changed_at ? `, ${fmtCreated(o.status_changed_at)}` : ''}
                  </div>
                )}
                {o.tg_message_id !== null && (
                  <a href={orderMessageUrl(o.tg_message_id)} target="_blank" rel="noreferrer">
                    Открыть сообщение в группе Orders →
                  </a>
                )}
                <div className="mt-2">
                  <div className="mb-1 text-[13px] font-bold text-ink-muted">Сменить статус вручную</div>
                  <div className="flex flex-wrap gap-2">
                    {(Object.keys(STATUS_LABEL) as OrderStatus[])
                      .filter((s) => s !== o.status)
                      .map((s) => (
                        <Btn key={s} kind={s === 'cancelled' ? 'danger' : 'ghost'} className="!min-h-9 !px-3 !text-sm" onClick={() => setOrderStatus(o, s)}>
                          → {STATUS_LABEL[s]}
                        </Btn>
                      ))}
                  </div>
                  <div className="mt-1 text-xs text-ink-muted">Сообщение в Telegram при этом не меняется.</div>
                </div>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
