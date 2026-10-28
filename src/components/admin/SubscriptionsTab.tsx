'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ddmm, labelShort, todayISO } from '@/lib/dates';
import { ruError } from '@/lib/admin/errors';
import { adminDb, PAYMENT_LABEL, STATUS_LABEL, type AdminOrder } from '@/lib/admin/client';
import { isEnding, matchesFilter, matchesQuery, subInfo, subSummary, type DotKind, type SubFilter } from '@/lib/admin/subscriptions';
import { formatPhone, phoneHref } from '@/lib/phone';
import { tgHref, tgLabel } from '@/lib/admin/telegram-link';
import { Err, Note, inputCls } from './ui';
import { OrderCard } from './OrderCard';

const FILTERS: [SubFilter, string][] = [
  ['active', 'Активные'],
  ['ending', 'Заканчиваются'],
  ['done', 'Завершённые'],
  ['new', 'Новые'],
];

const DOT: Record<DotKind, string> = { done: 'bg-success', ahead: 'bg-ink-muted/40', missed: 'bg-danger' };
const DOT_TITLE: Record<DotKind, string> = { done: 'доставлено', ahead: 'впереди', missed: 'прошёл, не отмечен доставленным' };

const stop = (e: React.SyntheticEvent) => e.stopPropagation();

function CopyAddress({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async (e) => {
        e.stopPropagation();
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {}
      }}
      className="text-left text-sm text-ink-2 underline decoration-dotted underline-offset-2"
      title="Нажмите, чтобы скопировать"
    >
      📍 {text} <span className="text-xs font-bold text-accent">{done ? '✓ скопировано' : 'копировать'}</span>
    </button>
  );
}

export function SubscriptionsTab({ adminEmail }: { adminEmail: string }) {
  const [orders, setOrders] = useState<AdminOrder[] | null>(null);
  const [filter, setFilter] = useState<SubFilter>('active');
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const today = todayISO();

  const load = useCallback(async () => {
    const { data, error } = await adminDb
      .from('orders')
      .select('*, order_days(id, delivery_date, qty, delivered)')
      .eq('type', 'subscription')
      .in('status', ['new', 'confirmed', 'delivered'])
      .order('created_at', { ascending: false })
      .limit(300);
    if (error) setError(ruError(error.message));
    else {
      setError('');
      setOrders((data ?? []) as unknown as AdminOrder[]);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const summary = useMemo(() => (orders ? subSummary(orders, today) : null), [orders, today]);
  const list = useMemo(() => {
    const rows = (orders ?? []).filter((o) => matchesQuery(o, query) && matchesFilter(filter, o, subInfo(o, today), today));
    // Ближе к концу — выше: чтобы кандидаты на продление были на виду.
    return filter === 'active' || filter === 'ending' ? rows.sort((a, b) => subInfo(a, today).lastDay.localeCompare(subInfo(b, today).lastDay)) : rows;
  }, [orders, filter, query, today]);

  return (
    <div className="flex flex-col gap-3">
      {summary && (
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-md2 border border-line bg-card px-2 py-3">
            <div className="font-serif text-[24px] font-bold">{summary.active}</div>
            <div className="text-xs text-ink-muted">активных подписок</div>
          </div>
          <div className="rounded-md2 border border-line bg-card px-2 py-3">
            <div className="font-serif text-[24px] font-bold">{summary.tomorrowPortions}</div>
            <div className="text-xs text-ink-muted">порций на завтра</div>
          </div>
          <button
            type="button"
            onClick={() => setFilter('ending')}
            className={`rounded-md2 border px-2 py-3 ${summary.ending ? 'border-accent bg-accent-soft' : 'border-line bg-card'}`}
          >
            <div className={`font-serif text-[24px] font-bold ${summary.ending ? 'text-accent' : ''}`}>{summary.ending}</div>
            <div className="text-xs text-ink-muted">заканчиваются в 2 дня</div>
          </button>
        </div>
      )}

      <div className="flex gap-1.5 overflow-x-auto pb-1" role="tablist">
        {FILTERS.map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={filter === id}
            onClick={() => setFilter(id)}
            className={`h-9 flex-none whitespace-nowrap rounded-chip border px-3 text-sm font-extrabold ${filter === id ? 'border-accent bg-accent text-white' : 'border-line bg-card text-ink-2'}`}
          >
            {label}
          </button>
        ))}
      </div>
      <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Ник, телефон, № заказа" className={inputCls} aria-label="Поиск" />

      <Err>{error}</Err>
      {notice && <div className="rounded-chip bg-success-bg px-3 py-2 text-sm font-bold text-success">{notice}</div>}
      {orders === null && !error && <Note>Загрузка…</Note>}
      {orders && list.length === 0 && <Note>Подписок нет</Note>}

      {list.map((o) => {
        const i = subInfo(o, today);
        const ending = isEnding(o, i, today);
        const href = tgHref(o.telegram);
        const pct = i.total ? Math.round((i.delivered / i.total) * 100) : 0;
        return (
          <OrderCard
            key={o.id}
            o={o}
            adminEmail={adminEmail}
            onChanged={load}
            onNotice={setNotice}
            className={ending ? '!border-accent !bg-accent-soft/60' : ''}
            head={
              <div className="flex flex-col gap-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[15px] font-extrabold">
                      {href ? (
                        <a href={href} target="_blank" rel="noreferrer" onClick={stop}>
                          {tgLabel(o.telegram)}
                        </a>
                      ) : (
                        tgLabel(o.telegram)
                      )}{' '}
                      <span className="text-sm font-bold text-ink-muted">· {o.order_number}</span>
                    </div>
                    {o.phone && (
                      <a href={phoneHref(o.phone)} onClick={stop} className="text-sm">
                        📞 {formatPhone(o.phone)}
                      </a>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-extrabold text-accent">{STATUS_LABEL[o.status]}</div>
                    <div className="text-xs text-ink-muted">
                      {o.qty} порц./день · {PAYMENT_LABEL[o.payment_method]}
                    </div>
                  </div>
                </div>
                <CopyAddress text={o.address} />

                <div>
                  <div className="mb-1 flex items-baseline justify-between text-sm">
                    <span className="font-extrabold">
                      доставлено {i.delivered} из {i.total}
                    </span>
                    <span className="text-xs text-ink-muted">{pct}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-sand">
                    <div className="h-full rounded-full bg-success" style={{ width: `${pct}%` }} />
                  </div>
                </div>
                <div className="flex flex-wrap justify-between gap-x-3 text-[13px] text-ink-2">
                  <span>следующая: <b>{i.next ? labelShort(i.next, 'ru') : '—'}</b></span>
                  <span className={ending ? 'font-extrabold text-accent' : ''}>
                    последний день: <b>{i.lastDay ? labelShort(i.lastDay, 'ru') : '—'}</b>
                    {ending && ' · продление?'}
                  </span>
                </div>
                <div className="flex flex-wrap gap-x-2 gap-y-1.5" aria-label="Дни подписки">
                  {i.dots.map((d) => (
                    <div key={d.id} className="flex w-9 flex-col items-center gap-0.5" title={`${labelShort(d.date, 'ru')} — ${DOT_TITLE[d.kind]}`}>
                      <span className={`h-3 w-3 rounded-full ${DOT[d.kind]}`} />
                      <span className="text-[10px] leading-none text-ink-muted">{ddmm(d.date)}</span>
                    </div>
                  ))}
                </div>
              </div>
            }
          />
        );
      })}
    </div>
  );
}
