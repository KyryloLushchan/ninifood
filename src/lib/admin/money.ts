import type { AdminOrder } from './client';

export interface Bucket {
  orders: number;
  portions: number;
  revenue: number;
}
export interface RevenueReport {
  total: Bucket;
  cash: Bucket;
  qr: Bucket;
  single: Bucket;
  subscription: Bucket;
}

const empty = (): Bucket => ({ orders: 0, portions: 0, revenue: 0 });

/**
 * Выручка по заказам confirmed + delivered (период уже отфильтрован по дате создания).
 * Чистая функция: сюда же позже добавятся расходы и себестоимость (отдельные источники данных,
 * вкладка «Деньги» просто сложит их с этим отчётом).
 */
export function computeRevenue(orders: AdminOrder[]): RevenueReport {
  const r: RevenueReport = { total: empty(), cash: empty(), qr: empty(), single: empty(), subscription: empty() };
  for (const o of orders) {
    if (o.status !== 'confirmed' && o.status !== 'delivered') continue;
    const portions = o.order_days.reduce((s, d) => s + d.qty, 0);
    for (const b of [r.total, o.payment_method === 'cash' ? r.cash : r.qr, o.type === 'single' ? r.single : r.subscription]) {
      b.orders += 1;
      b.portions += portions;
      b.revenue += o.total;
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
 * Прибыль = выручка с заказов + ручной приход − расход.
 * Сюда же позже добавится себестоимость (ещё одно вычитаемое), источники данных — отдельные.
 */
export function computeProfit(revenue: number, movements: CashMovement[], categories: CashCategory[]): ProfitReport {
  const names = new Map(categories.map((c) => [c.id, c.name]));
  let cashIn = 0;
  let cashOut = 0;
  const byCat = new Map<number, number>();
  for (const m of movements) {
    if (m.type === 'in') cashIn += m.amount;
    else {
      cashOut += m.amount;
      byCat.set(m.category_id, (byCat.get(m.category_id) ?? 0) + m.amount);
    }
  }
  const expenses = [...byCat].map(([categoryId, amount]) => ({ categoryId, name: names.get(categoryId) ?? 'Без категории', amount })).sort((a, b) => b.amount - a.amount);
  return { revenue, cashIn, cashOut, profit: revenue + cashIn - cashOut, expenses };
}
