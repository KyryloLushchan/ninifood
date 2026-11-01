import { PRICE_SINGLE, PRICE_SUB, SUB_MIN_DAYS } from '@/config/site';
import { discountAmount } from '@/lib/pricing';
import type { AdminOrder } from './client';

export const PORTIONS_MIN = 1;
export const PORTIONS_MAX = 10;

/** День можно менять, только если он в будущем (сегодня и прошлые закрыты: кухня получает снимок в 00:00) и ещё не доставлен. */
export const dayEditable = (d: AdminOrder['order_days'][number], today: string) => !d.delivered && d.delivery_date > today;

export interface PortionsPreview {
  oldPortions: number;
  newPortions: number;
  oldTotal: number;
  newTotal: number;
  /** > 0 — доплата, < 0 — возврат. */
  diff: number;
}

/**
 * Пересчёт суммы заказа при новых порциях по дням — копия правил RPC `admin_change_portions` (сервер считает сам, это только показ):
 * цена обеда = обеды заказа до скидки / число порций (150 000 в подписке, 170 000 разово), скидка по проценту заказа
 * (`discountAmount`), доставка не меняется.
 */
export function previewPortions(o: AdminOrder, qtys: Record<number, number>): PortionsPreview {
  const oldPortions = o.order_days.reduce((s, d) => s + d.qty, 0);
  const newPortions = o.order_days.reduce((s, d) => s + (qtys[d.id] ?? d.qty), 0);
  const oldMeals = o.total - o.delivery_total + o.discount_amount;
  const unit = oldPortions > 0 && oldMeals > 0 && oldMeals % oldPortions === 0 ? oldMeals / oldPortions : o.type === 'subscription' ? PRICE_SUB / SUB_MIN_DAYS : PRICE_SINGLE;
  const meals = newPortions * unit;
  const newTotal = meals - (o.discount_percent > 0 ? discountAmount(meals, o.discount_percent) : 0) + o.delivery_total;
  return { oldPortions, newPortions, oldTotal: o.total, newTotal, diff: newTotal - o.total };
}
