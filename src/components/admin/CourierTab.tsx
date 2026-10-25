'use client';

import { useCallback, useEffect, useState } from 'react';
import { addDays, labelFull, todayISO } from '@/lib/dates';
import { fmtMoney } from '@/lib/format';
import { adminDb } from '@/lib/admin/client';
import { tgHref, tgLabel } from '@/lib/admin/telegram-link';
import { Btn, Card, Err, Note, inputCls } from './ui';

interface Row {
  id: number;
  delivery_date: string;
  qty: number;
  delivered: boolean;
  orders: {
    id: string;
    order_number: string;
    status: 'new' | 'confirmed';
    telegram: string;
    address: string;
    hotel: string | null;
    comment: string | null;
    payment_method: 'qr' | 'cash';
    total: number;
    order_days: { delivery_date: string }[];
  };
}

/** Наличные берём в ПЕРВЫЙ день доставки заказа, дальше — «оплачено». */
const cashDue = (r: Row) =>
  r.orders.payment_method === 'cash' && r.delivery_date === [...r.orders.order_days].map((d) => d.delivery_date).sort()[0]
    ? r.orders.total
    : 0;

export function CourierTab() {
  const [date, setDate] = useState(() => addDays(todayISO(), 1));
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setError('');
    const { data, error } = await adminDb
      .from('order_days')
      .select(
        'id, delivery_date, qty, delivered, orders!inner(id, order_number, status, telegram, address, hotel, comment, payment_method, total, order_days(delivery_date))',
      )
      .eq('delivery_date', date)
      .in('orders.status', ['new', 'confirmed'])
      .order('id');
    if (error) setError(error.message);
    else setRows((data ?? []) as unknown as Row[]);
  }, [date]);

  useEffect(() => {
    setRows(null);
    load();
  }, [load]);

  const toggle = async (r: Row) => {
    const { error } = await adminDb.from('order_days').update({ delivered: !r.delivered }).eq('id', r.id);
    if (error) setError(error.message);
    else load(); // статус заказа меняет триггер в БД
  };

  const confirmed = (rows ?? []).filter((r) => r.orders.status === 'confirmed');
  const pending = (rows ?? []).filter((r) => r.orders.status === 'new');
  const sum = (l: Row[]) => l.reduce((s, r) => s + r.qty, 0);

  const copy = async () => {
    const lines = [`Доставка на ${labelFull(date, 'ru')} — ${confirmed.length} адр., ${sum(confirmed)} порц.`, ''];
    confirmed.forEach((r, i) => {
      const due = cashDue(r);
      lines.push(
        `${i + 1}) ${r.orders.address}${r.orders.hotel ? ` (${r.orders.hotel})` : ''}`,
        `   Telegram: ${tgLabel(r.orders.telegram)}`,
        `   Порций: ${r.qty}`,
        `   ${due ? `Взять наличными: ${fmtMoney(due)}` : 'Оплачено'}`,
        ...(r.orders.comment ? [`   Комментарий: ${r.orders.comment}`] : []),
        '',
      );
    });
    try {
      await navigator.clipboard.writeText(lines.join('\n').trim());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Не удалось скопировать — разрешите доступ к буферу обмена');
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Btn kind="ghost" onClick={() => setDate(addDays(date, -1))} aria-label="Раньше">←</Btn>
        <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className={inputCls} />
        <Btn kind="ghost" onClick={() => setDate(addDays(date, 1))} aria-label="Позже">→</Btn>
      </div>
      <div className="text-center text-sm font-bold text-ink-2">{labelFull(date, 'ru')}</div>
      <Err>{error}</Err>

      {rows && (
        <Card className="flex flex-col gap-1">
          <div className="text-[17px] font-extrabold">
            {sum(confirmed)} порций <span className="text-sm font-bold text-ink-muted">· подтверждено, {confirmed.length} адр.</span>
          </div>
          {pending.length > 0 && (
            <div className="text-sm font-bold text-accent">
              ещё не подтверждено: {sum(pending)} порций ({pending.length} зак.)
            </div>
          )}
        </Card>
      )}

      {rows === null && <Note>Загрузка…</Note>}
      {rows && confirmed.length === 0 && <Note>На эту дату подтверждённых доставок нет</Note>}

      {confirmed.map((r) => {
        const due = cashDue(r);
        const href = tgHref(r.orders.telegram);
        return (
          <Card key={r.id} className={r.delivered ? 'bg-success-bg2 opacity-80' : ''}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-col gap-0.5">
                <div className="text-[15px] font-extrabold">{r.orders.address}</div>
                {r.orders.hotel && <div className="text-sm text-ink-2">🏨 {r.orders.hotel}</div>}
                <div className="text-sm">
                  {href ? (
                    <a href={href} target="_blank" rel="noreferrer">
                      {tgLabel(r.orders.telegram)}
                    </a>
                  ) : (
                    tgLabel(r.orders.telegram)
                  )}
                  <span className="text-ink-muted"> · {r.orders.order_number}</span>
                </div>
                {r.orders.comment && <div className="text-sm text-ink-muted">💬 {r.orders.comment}</div>}
              </div>
              <div className="text-right">
                <div className="text-[17px] font-extrabold">{r.qty} порц.</div>
                <div className={`text-sm font-bold ${due ? 'text-accent' : 'text-success'}`}>
                  {due ? `к получению: ${fmtMoney(due)}` : 'оплачено'}
                </div>
              </div>
            </div>
            <Btn kind={r.delivered ? 'ghost' : 'primary'} className="mt-3 w-full" onClick={() => toggle(r)}>
              {r.delivered ? '✓ Доставлено (отменить)' : 'Доставлено'}
            </Btn>
          </Card>
        );
      })}

      {confirmed.length > 0 && (
        <Btn kind="outline" onClick={copy}>
          {copied ? 'Скопировано ✓' : 'Скопировать список'}
        </Btn>
      )}
    </div>
  );
}
