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
