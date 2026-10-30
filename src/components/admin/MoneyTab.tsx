'use client';

import { useEffect, useMemo, useState } from 'react';
import { dayRangeUTC, todayISO } from '@/lib/dates';
import { fmtMoney } from '@/lib/format';
import { ruError } from '@/lib/admin/errors';
import { adminDb, type AdminOrder } from '@/lib/admin/client';
import { cashReceivable, computeProfit, computeRevenue, type Bucket, type CashCategory, type CashMovement } from '@/lib/admin/money';
import { PRESETS, periodRange, type Preset } from '@/lib/admin/period';
import { Btn, Card, Err, Note, inputCls } from './ui';

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
  const [cashOrders, setCashOrders] = useState<AdminOrder[] | null>(null);
  const [receivable, setReceivable] = useState<{ count: number; amount: number } | null>(null);
  const [moves, setMoves] = useState<CashMovement[] | null>(null);
  const [cats, setCats] = useState<CashCategory[]>([]);
  const [error, setError] = useState('');

  const [a, b] = periodRange(preset, from, to);

  useEffect(() => {
    setOrders(null);
    const { from: f, to: t } = dayRangeUTC(a, b);
    adminDb
      .from('orders')
      .select('*, order_days(id, delivery_date, qty, delivered)')
      .in('status', ['confirmed', 'delivered'])
      .neq('payment_method', 'cash') // наличные считаются по доставке (ниже)
      .gte('created_at', f)
      .lt('created_at', t)
      .then(({ data, error }) => {
        if (error) setError(ruError(error.message));
        else {
          setError('');
          setOrders((data ?? []) as unknown as AdminOrder[]);
        }
      });
  }, [a, b]);

  // Наличные: заказы автозаписей кассы с датой в периоде (дата = день доставки первого дня, отмечен доставленным).
  useEffect(() => {
    setCashOrders(null);
    adminDb
      .from('cash_movements')
      .select('order_id, orders(*, order_days(id, delivery_date, qty, delivered))')
      .not('order_id', 'is', null)
      .gte('date', a)
      .lte('date', b)
      .then(({ data, error }) => {
        if (error) setError(ruError(error.message));
        else setCashOrders(((data ?? []) as unknown as { orders: AdminOrder | null }[]).map((r) => r.orders).filter((o): o is AdminOrder => !!o));
      });
  }, [a, b]);

  // «К получению»: все подтверждённые наличные, первый день не доставлен (не зависит от периода).
  useEffect(() => {
    adminDb
      .from('orders')
      .select('id, status, payment_method, total, order_days(id, delivery_date, qty, delivered)')
      .eq('payment_method', 'cash')
      .eq('status', 'confirmed')
      .then(({ data }) => setReceivable(cashReceivable((data ?? []) as unknown as AdminOrder[])));
  }, []);

  useEffect(() => {
    setMoves(null);
    Promise.all([
      adminDb.from('cash_movements').select('id, date, type, category_id, amount, comment, order_id').gte('date', a).lte('date', b),
      adminDb.from('cash_categories').select('*'),
    ]).then(([m, c]) => {
      const err = m.error ?? c.error;
      if (err) setError(ruError(err.message));
      else {
        setMoves((m.data ?? []) as CashMovement[]);
        setCats((c.data ?? []) as CashCategory[]);
      }
    });
  }, [a, b]);

  const report = useMemo(() => (orders && cashOrders ? computeRevenue([...orders, ...cashOrders]) : null), [orders, cashOrders]);

  const profit = useMemo(() => (report && moves ? computeProfit(report.total.revenue, moves, cats) : null), [report, moves, cats]);

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
        Заказы QR и «другой способ» — по дате создания, наличные — по дате доставки первого дня (если доставлен), касса — по дате операции · {a === b ? a : `${a} — ${b}`} · подтверждённые и доставленные
      </div>
      <Err>{error}</Err>
      {!report && !error && <Note>Загрузка…</Note>}
      {report && profit && (
        <div className="contents lg:grid lg:grid-cols-2 lg:items-start lg:gap-3 min-[1536px]:grid-cols-3">
          <Card>
            <div className="text-sm text-ink-muted">Прибыль</div>
            <div className={`font-serif text-[32px] font-bold ${profit.profit < 0 ? 'text-danger' : ''}`}>{fmtMoney(profit.profit)}</div>
            <div className="mt-1 flex flex-col gap-0.5 text-sm text-ink-2">
              <div className="flex justify-between"><span>Выручка с заказов</span><span>{fmtMoney(profit.revenue)}</span></div>
              <div className="flex justify-between"><span>+ Приход (касса)</span><span>{fmtMoney(profit.cashIn)}</span></div>
              <div className="flex justify-between"><span>− Расход</span><span>{fmtMoney(profit.cashOut)}</span></div>
            </div>
          </Card>
          {profit.expenses.length > 0 && (
            <Card className="divide-y divide-line">
              <div className="pb-2 text-sm text-ink-muted">Расходы по категориям</div>
              {profit.expenses.map((e) => (
                <div key={e.categoryId} className="flex items-baseline justify-between py-2 text-[15px]">
                  <span className="font-bold">{e.name}</span>
                  <span>{fmtMoney(e.amount)}</span>
                </div>
              ))}
            </Card>
          )}
          <Card>
            <div className="text-sm text-ink-muted">Выручка</div>
            <div className="font-serif text-[32px] font-bold">{fmtMoney(report.total.revenue)}</div>
            <div className="text-sm text-ink-2">
              обеды {fmtMoney(report.total.revenue - report.total.delivery)} · доставка {fmtMoney(report.total.delivery)}
            </div>
            {report.total.discount > 0 && <div className="text-sm text-ink-2">Скидки (уже вычтены из выручки): {fmtMoney(report.total.discount)}</div>}
            <div className="text-sm text-ink-2">{report.total.orders} заказов · {report.total.portions} порций</div>
          </Card>
          {receivable && (
            <Card>
              <div className="text-sm text-ink-muted">Наличные к получению</div>
              <div className="font-serif text-[32px] font-bold">{fmtMoney(receivable.amount)}</div>
              <div className="text-sm text-ink-2">{receivable.count} подтв. заказов, первый день ещё не доставлен (в выручку и кассу не входят)</div>
            </Card>
          )}
          <Card className="divide-y divide-line">
            <Row title="Наличные (доставлено)" b={report.cash} />
            <Row title="QR" b={report.qr} />
            <Row title="Другой способ" b={report.other} />
          </Card>
          <Card className="divide-y divide-line">
            <Row title="Разовые" b={report.single} />
            <Row title="Подписки" b={report.subscription} />
          </Card>
        </div>
      )}
    </div>
  );
}
