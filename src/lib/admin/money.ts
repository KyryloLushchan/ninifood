import type { AdminOrder } from './client';

export interface Bucket {
  orders: number;
  portions: number;
  revenue: number;
  /** Доставка внутри revenue. */
  delivery: number;
  /** Персональные скидки, уже вычтенные из revenue (информационно). */
  discount: number;
}
export interface RevenueReport {
  total: Bucket;
  cash: Bucket;
  qr: Bucket;
  other: Bucket;
  single: Bucket;
  subscription: Bucket;
}

const empty = (): Bucket => ({ orders: 0, portions: 0, revenue: 0, delivery: 0, discount: 0 });

/**
 * Выручка по заказам confirmed + delivered. Набор заказов собирает вызывающий (вкладка «Деньги»):
 * QR и «другой способ» — по дате создания в периоде; наличные — по дате доставки ПЕРВОГО дня и только если он отмечен
 * доставленным (это заказы автозаписей кассы). `orders.total` уже после скидки, поэтому выручка — после скидок; сумма скидок считается отдельно.
 * Чистая функция: сюда же позже добавятся расходы и себестоимость (отдельные источники данных,
 * вкладка «Деньги» просто сложит их с этим отчётом).
 */
export function computeRevenue(orders: AdminOrder[]): RevenueReport {
  const r: RevenueReport = { total: empty(), cash: empty(), qr: empty(), other: empty(), single: empty(), subscription: empty() };
  for (const o of orders) {
    if (o.status !== 'confirmed' && o.status !== 'delivered') continue;
    const portions = o.order_days.reduce((s, d) => s + d.qty, 0);
    for (const b of [r.total, o.payment_method === 'cash' ? r.cash : o.payment_method === 'other' ? r.other : r.qr, o.type === 'single' ? r.single : r.subscription]) {
      b.orders += 1;
      b.portions += portions;
      b.revenue += o.total;
      b.delivery += o.delivery_total;
      b.discount += o.discount_amount ?? 0;
    }
  }
  return r;
}

export interface CashCategory {
  id: number;
  type: 'in' | 'out';
  name: string;
  sort: number;
  is_active: boolean;
}

export interface CashMovement {
  id: number;
  date: string;
  type: 'in' | 'out';
  category_id: number;
  amount: number;
  comment: string | null;
  /** Не пусто — автозапись «Наличные с заказов» (создаёт и удаляет триггер БД по отметке доставки). */
  order_id?: string | null;
}

export interface ProfitReport {
  revenue: number;
  cashIn: number;
  cashOut: number;
  profit: number;
  /** Расходы по категориям, по убыванию суммы. */
  expenses: { categoryId: number; name: string; amount: number }[];
}

/**
 * Прибыль = выручка с заказов + ручной приход − расход. Автозаписи кассы по наличным заказам (order_id) в приход НЕ входят:
 * эти деньги уже в выручке (наличные считаются по доставке), иначе был бы двойной учёт.
 * Сюда же позже добавится себестоимость (ещё одно вычитаемое), источники данных — отдельные.
 */
export function computeProfit(revenue: number, movements: CashMovement[], categories: CashCategory[]): ProfitReport {
  const names = new Map(categories.map((c) => [c.id, c.name]));
  let cashIn = 0;
  let cashOut = 0;
  const byCat = new Map<number, number>();
  for (const m of movements) {
    if (m.order_id) continue;
    if (m.type === 'in') cashIn += m.amount;
    else {
      cashOut += m.amount;
      byCat.set(m.category_id, (byCat.get(m.category_id) ?? 0) + m.amount);
    }
  }
  const expenses = [...byCat].map(([categoryId, amount]) => ({ categoryId, name: names.get(categoryId) ?? 'Без категории', amount })).sort((a, b) => b.amount - a.amount);
  return { revenue, cashIn, cashOut, profit: revenue + cashIn - cashOut, expenses };
}

/** Наличные, которые ещё предстоит получить: подтверждённые наличные заказы, у которых первый день ещё не доставлен. */
export function cashReceivable(orders: AdminOrder[]): { count: number; amount: number } {
  let count = 0;
  let amount = 0;
  for (const o of orders) {
    if (o.payment_method !== 'cash' || o.status !== 'confirmed') continue;
    const first = [...o.order_days].sort((a, b) => a.delivery_date.localeCompare(b.delivery_date) || a.id - b.id)[0];
    if (!first || first.delivered) continue;
    count += 1;
    amount += o.total;
  }
  return { count, amount };
}
