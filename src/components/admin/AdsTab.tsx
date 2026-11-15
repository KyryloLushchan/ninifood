'use client';

import { useEffect, useMemo, useState } from 'react';
import { addDays, dayRangeUTC, todayISO } from '@/lib/dates';
import { fmtMoney } from '@/lib/format';
import { ruError } from '@/lib/admin/errors';
import { adminDb } from '@/lib/admin/client';
import { computeAds, type AdOrder, type AdVisitRow } from '@/lib/admin/ads';
import { Btn, Card, Err, Note } from './ui';

type Range = '7' | '30' | 'all';
const RANGES: [Range, string][] = [['7', '7 дней'], ['30', '30 дней'], ['all', 'За всё время']];
const PAGE = 1000;

/** Начало периода (ISO, Дананг-время, начало суток) или null — за всё время. */
const sinceOf = (r: Range): string | null => (r === 'all' ? null : dayRangeUTC(addDays(todayISO(), -(Number(r) - 1)), todayISO()).from);

function Stat({ label, value, strong }: { label: string; value: string | number; strong?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] font-bold uppercase tracking-wide text-ink-muted">{label}</div>
      <div className={`${strong ? 'font-serif text-[18px] font-bold' : 'text-[16px] font-extrabold'}`}>{value}</div>
    </div>
  );
}

/**
 * «Реклама»: по каждому коду (?s=…) — уникальные визиты, открыли форму, заказы, оплачено, подписки, выручка; отдельно новые клиенты и повторные заказы этих клиентов.
 * Только просмотр (всё чтение; визиты — через RPC ad_visit_stats, доступна admin и viewer, остальным forbidden). Правила атрибуции — в `src/lib/admin/ads.ts`.
 */
export function AdsTab() {
  const [range, setRange] = useState<Range>('30');
  const [orders, setOrders] = useState<AdOrder[] | null>(null);
  const [visits, setVisits] = useState<AdVisitRow[] | null>(null);
  const [error, setError] = useState('');

  // Все заказы (нужны, чтобы найти ПЕРВЫЙ заказ клиента): страницами по 1000.
  useEffect(() => {
    let alive = true;
    (async () => {
      const all: AdOrder[] = [];
      for (let i = 0; ; i += PAGE) {
        const { data, error } = await adminDb
          .from('orders')
          .select('id, created_at, telegram, phone, customer_id, status, type, payment_method, total, source_first, source_last, order_days(delivery_date, delivered)')
          .order('created_at')
          .order('id')
          .range(i, i + PAGE - 1);
        if (error) return alive && setError(ruError(error.message));
        all.push(...((data ?? []) as unknown as AdOrder[]));
        if (!data || data.length < PAGE) break;
      }
      if (alive) setOrders(all);
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    setVisits(null);
    adminDb.rpc('ad_visit_stats', { p_since: sinceOf(range) }).then(({ data, error }) => {
      if (!alive) return;
      if (error) setError(ruError(error.message));
      else {
        setError('');
        setVisits((data ?? []) as AdVisitRow[]);
      }
    });
    return () => {
      alive = false;
    };
  }, [range]);

  const rows = useMemo(() => (orders && visits ? computeAds(orders, visits, sinceOf(range)) : null), [orders, visits, range]);

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-3 gap-1.5">
        {RANGES.map(([id, label]) => (
          <Btn key={id} kind={range === id ? 'primary' : 'ghost'} className="!px-1 !text-sm" onClick={() => setRange(id)}>
            {label}
          </Btn>
        ))}
      </div>
      <div className="text-center text-xs text-ink-muted">
        Клиент «из источника» — по его первому заказу; все его заказы и подписки идут этому коду. Оплачено — подтверждённые и доставленные (наличные — после доставки первого дня). Заказы — по дате создания.
      </div>
      <Err>{error}</Err>
      {!rows && !error && <Note>Загрузка…</Note>}
      {rows && rows.length === 0 && <Note>За этот период переходов и заказов по рекламным ссылкам нет.</Note>}
      <div className="grid gap-3 lg:grid-cols-2">
        {rows?.map((r) => (
          <Card key={r.code} data-ad-code={r.code}>
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <div className="break-all font-mono text-[17px] font-extrabold">{r.code}</div>
              <div className="font-serif text-[20px] font-bold">{fmtMoney(r.revenue)}</div>
            </div>
            <div className="grid grid-cols-3 gap-x-3 gap-y-3">
              <Stat label="Визиты" value={r.visits} />
              <Stat label="Открыли форму" value={r.opens} />
              <Stat label="Заказы" value={r.orders} />
              <Stat label="Оплачено" value={r.paid} />
              <Stat label="Подписки" value={r.subs} />
              <Stat label="Выручка" value={fmtMoney(r.revenue)} />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 border-t border-line pt-3">
              <Stat label="Новые клиенты" value={r.newClients} />
              <Stat label="Повторные заказы" value={r.repeatOrders} />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
