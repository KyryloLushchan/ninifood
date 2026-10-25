'use client';

import { useEffect, useMemo, useState } from 'react';
import { addDays, dayRangeUTC, todayISO, weekStart } from '@/lib/dates';
import { fmtMoney } from '@/lib/format';
import { adminDb, type AdminOrder } from '@/lib/admin/client';
import { computeRevenue, type Bucket } from '@/lib/admin/money';
import { Btn, Card, Err, Note, inputCls } from './ui';

type Preset = 'today' | 'week' | 'month' | 'custom';

function range(p: Preset, from: string, to: string): [string, string] {
  const t = todayISO();
  if (p === 'today') return [t, t];
  if (p === 'week') {
    const m = weekStart(t);
    return [m, addDays(m, 6)];
  }
  if (p === 'month') {
    const first = `${t.slice(0, 7)}-01`;
    const next = new Date(Date.UTC(+t.slice(0, 4), +t.slice(5, 7), 1)).toISOString().slice(0, 10);
    return [first, addDays(next, -1)];
  }
  return [from, to < from ? from : to];
}

const PRESETS: [Preset, string][] = [['today', 'Сегодня'], ['week', 'Неделя'], ['month', 'Месяц'], ['custom', 'Свой']];

function Row({ title, b }: { title: string; b: Bucket }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2">
      <div>
        <div className="text-[15px] font-extrabold">{title}</div>
        <div className="text-xs text-ink-muted">{b.orders} зак. · {b.portions} порц.</div>
      </div>
      <div className="font-serif text-[18px] font-bold">{fmtMoney(b.revenue)}</div>
    </div>
  );
}

export function MoneyTab() {
  const [preset, setPreset] = useState<Preset>('week');
  const [from, setFrom] = useState(todayISO());
  const [to, setTo] = useState(todayISO());
  const [orders, setOrders] = useState<AdminOrder[] | null>(null);
  const [error, setError] = useState('');

  const [a, b] = range(preset, from, to);

  useEffect(() => {
    setOrders(null);
    const { from: f, to: t } = dayRangeUTC(a, b);
    adminDb
      .from('orders')
      .select('*, order_days(id, delivery_date, qty, delivered)')
      .in('status', ['confirmed', 'delivered'])
      .gte('created_at', f)
      .lt('created_at', t)
      .then(({ data, error }) => {
        if (error) setError(error.message);
        else {
          setError('');
          setOrders((data ?? []) as unknown as AdminOrder[]);
        }
      });
  }, [a, b]);

  const report = useMemo(() => (orders ? computeRevenue(orders) : null), [orders]);

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-4 gap-1.5">
        {PRESETS.map(([id, label]) => (
          <Btn key={id} kind={preset === id ? 'primary' : 'ghost'} className="!px-1 !text-sm" onClick={() => setPreset(id)}>
            {label}
          </Btn>
        ))}
      </div>
      {preset === 'custom' && (
        <div className="flex items-center gap-2">
          <input type="date" value={from} onChange={(e) => e.target.value && setFrom(e.target.value)} className={inputCls} />
          <span>—</span>
          <input type="date" value={to} onChange={(e) => e.target.value && setTo(e.target.value)} className={inputCls} />
        </div>
      )}
      <div className="text-center text-xs text-ink-muted">
        По дате создания заказа · {a === b ? a : `${a} — ${b}`} · подтверждённые и доставленные
      </div>
      <Err>{error}</Err>
      {!report && !error && <Note>Загрузка…</Note>}
      {report && (
        <>
          <Card>
            <div className="text-sm text-ink-muted">Выручка</div>
            <div className="font-serif text-[32px] font-bold">{fmtMoney(report.total.revenue)}</div>
            <div className="text-sm text-ink-2">{report.total.orders} заказов · {report.total.portions} порций</div>
          </Card>
          <Card className="divide-y divide-line">
            <Row title="Наличные" b={report.cash} />
            <Row title="QR" b={report.qr} />
          </Card>
          <Card className="divide-y divide-line">
            <Row title="Разовые" b={report.single} />
            <Row title="Подписки" b={report.subscription} />
          </Card>
        </>
      )}
    </div>
  );
}
