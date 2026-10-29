'use client';

import { useCallback, useEffect, useState } from 'react';
import { ruError } from '@/lib/admin/errors';
import { adminDb, STATUS_LABEL, type AdminOrder, type OrderStatus } from '@/lib/admin/client';
import { Btn, Err, Note, inputCls } from './ui';
import { OrderCard } from './OrderCard';

export function OrdersTab({ adminEmail }: { adminEmail: string }) {
  const [date, setDate] = useState('');
  const [status, setStatus] = useState<'' | OrderStatus>('');
  const [orders, setOrders] = useState<AdminOrder[] | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setError('');
    let ids: string[] | null = null;
    if (date) {
      const { data, error } = await adminDb.from('order_days').select('order_id').eq('delivery_date', date);
      if (error) return setError(ruError(error.message));
      ids = [...new Set((data ?? []).map((d) => d.order_id as string))];
    }
    let q = adminDb.from('orders').select('*, order_days(id, delivery_date, qty, delivered)').order('created_at', { ascending: false }).limit(100);
    if (status) q = q.eq('status', status);
    if (ids) q = q.in('id', ids);
    const { data, error } = await q;
    if (error) setError(ruError(error.message));
    else setOrders((data ?? []) as unknown as AdminOrder[]);
  }, [date, status]);

  useEffect(() => {
    setOrders(null);
    load();
  }, [load]);

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
      {notice && <div className="rounded-chip bg-success-bg px-3 py-2 text-sm font-bold text-success">{notice}</div>}
      {orders === null && <Note>Загрузка…</Note>}
      {orders?.length === 0 && <Note>Заказов нет</Note>}

      <div className="contents lg:grid lg:grid-cols-2 lg:items-start lg:gap-3 min-[1536px]:grid-cols-3">
      {orders?.map((o) => (
        <OrderCard key={o.id} o={o} adminEmail={adminEmail} onChanged={load} onNotice={setNotice} />
      ))}
      </div>
    </div>
  );
}
