export type OrderType = 'once' | 'sub';

export interface Totals {
  /** Обеды без скидки. */
  food: number;
  /** Скидка на обеды (₫, ≥ 0). */
  discount: number;
  /** Процент персональной скидки (0 — нет). */
  percent: number;
  delivery: number;
  /** К оплате: обеды − скидка + доставка. */
  total: number;
}

/**
 * Скидка на обеды (доставка без скидки), округление скидки до 1 000 ₫ в пользу клиента, не больше стоимости обедов.
 * Копия: supabase/functions/_shared/discount.ts (правки вносить в обе). Сервер всё равно считает сам.
 */
export function discountAmount(food: number, percent: number): number {
  if (!(percent > 0) || !(food > 0)) return 0;
  return Math.min(food, Math.ceil((food * percent) / 100 / 1000) * 1000);
}

const totals = (food: number, delivery: number, percent: number): Totals => {
  const discount = discountAmount(food, percent);
  return { food, discount, percent: discount > 0 ? percent : 0, delivery, total: food - discount + delivery };
};

/** Разовый: доставка — за каждый день доставки (не за порцию). */
export const onceTotals = (days: number, portions: number, priceSingle: number, deliveryPerDay: number, percent = 0) =>
  totals(days * portions * priceSingle, days * deliveryPerDay, percent);
/** Подписка (от 5 дней): обед = priceSub / minDays, доставка — за каждый день, как у разового. */
export const subTotals = (days: number, portions: number, priceSub: number, minDays: number, deliveryPerDay: number, percent = 0) =>
  totals(days * portions * Math.round(priceSub / minDays), days * deliveryPerDay, percent);
