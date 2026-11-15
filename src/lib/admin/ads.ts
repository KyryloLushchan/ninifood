/**
 * Вкладка «Реклама»: воронка и заказы по кодам источников. Чистые функции (проверка — `tools/ad-check/check.mts`).
 *
 * Клиент = один человек по нику Telegram / телефону / аккаунту (заказы, связанные любым из признаков, — один клиент).
 * Источник клиента = источник его ПЕРВОГО заказа (по created_at; отменённые заказы в расчёт не входят): `source_first`, а если его нет — `source_last`.
 * Все его заказы (в т.ч. будущие и подписки) засчитываются этому источнику; нет кода у первого заказа — клиент «без источника», его заказы в рекламе не показываются.
 * Заказы, оплачено, подписки, выручка — по дате создания заказа в периоде. Оплачено: подтверждён/доставлен (наличные — только когда отмечен доставленным первый день);
 * выручка — сумма `total` оплаченных. Новый клиент — первый заказ которого попал в период; повторные заказы — заказы периода не первые у клиента.
 */
export interface AdOrder {
  id: string;
  created_at: string;
  telegram: string;
  phone: string | null;
  customer_id: string | null;
  status: 'new' | 'confirmed' | 'delivered' | 'cancelled';
  type: 'single' | 'subscription';
  payment_method: 'qr' | 'cash' | 'other';
  total: number;
  source_first: string | null;
  source_last: string | null;
  order_days: { delivery_date: string; delivered: boolean }[];
}
export interface AdVisitRow {
  code: string;
  visits: number;
  opens: number;
}
export interface AdRow {
  code: string;
  visits: number;
  opens: number;
  orders: number;
  paid: number;
  subs: number;
  revenue: number;
  newClients: number;
  repeatOrders: number;
}

const nickKey = (t: string) => t.trim().replace(/^https?:\/\/(www\.)?t\.me\//i, '').replace(/^t\.me\//i, '').replace(/^@/, '').toLowerCase();
const phoneKey = (p: string | null) => {
  const d = (p ?? '').replace(/\D/g, '').replace(/^84/, '').replace(/^0+/, '');
  return d.length >= 7 ? d : '';
};

export function isPaid(o: AdOrder): boolean {
  if (o.status !== 'confirmed' && o.status !== 'delivered') return false;
  if (o.payment_method !== 'cash') return true;
  const first = [...o.order_days].sort((a, b) => a.delivery_date.localeCompare(b.delivery_date))[0];
  return !!first?.delivered;
}

/** id клиента (union-find по нику/телефону/аккаунту) для каждого заказа. */
export function clientIds(orders: AdOrder[]): Map<string, string> {
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r)!;
    while (parent.get(x) !== r) {
      const n = parent.get(x)!;
      parent.set(x, r);
      x = n;
    }
    return r;
  };
  const union = (a: string, b: string) => {
    if (!parent.has(a)) parent.set(a, a);
    if (!parent.has(b)) parent.set(b, b);
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };
  for (const o of orders) {
    const keys = [nickKey(o.telegram) && `n:${nickKey(o.telegram)}`, phoneKey(o.phone) && `p:${phoneKey(o.phone)}`, o.customer_id && `c:${o.customer_id}`].filter(Boolean) as string[];
    const own = `o:${o.id}`;
    union(own, keys[0] ?? own);
    for (const k of keys.slice(1)) union(own, k);
  }
  const out = new Map<string, string>();
  for (const o of orders) out.set(o.id, find(`o:${o.id}`));
  return out;
}

/** since — начало периода (ISO), null — за всё время. orders — ВСЕ заказы (нужны, чтобы найти первый заказ клиента), visits — из RPC `ad_visit_stats` за тот же период. */
export function computeAds(orders: AdOrder[], visits: AdVisitRow[], since: string | null): AdRow[] {
  const live = orders.filter((o) => o.status !== 'cancelled').sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
  const cid = clientIds(live);
  const firstOf = new Map<string, AdOrder>();
  for (const o of live) if (!firstOf.has(cid.get(o.id)!)) firstOf.set(cid.get(o.id)!, o);
  const rows = new Map<string, AdRow>();
  const row = (code: string) => {
    let r = rows.get(code);
    if (!r) rows.set(code, (r = { code, visits: 0, opens: 0, orders: 0, paid: 0, subs: 0, revenue: 0, newClients: 0, repeatOrders: 0 }));
    return r;
  };
  for (const v of visits) {
    const r = row(v.code);
    r.visits += v.visits;
    r.opens += v.opens;
  }
  for (const o of live) {
    if (since && o.created_at < since) continue;
    const first = firstOf.get(cid.get(o.id)!)!;
    const code = first.source_first ?? first.source_last;
    if (!code) continue;
    const r = row(code);
    r.orders += 1;
    if (o.type === 'subscription') r.subs += 1;
    if (isPaid(o)) {
      r.paid += 1;
      r.revenue += o.total;
    }
    if (first.id === o.id) r.newClients += 1;
    else r.repeatOrders += 1;
  }
  return [...rows.values()].sort((a, b) => b.orders - a.orders || b.visits - a.visits || a.code.localeCompare(b.code));
}
