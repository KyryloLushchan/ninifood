export type OrderType = 'once' | 'sub';

export interface Totals {
  food: number;
  delivery: number;
  total: number;
}

const totals = (food: number, delivery: number): Totals => ({ food, delivery, total: food + delivery });

/** Разовый: доставка — за каждый день доставки (не за порцию). */
export const onceTotals = (days: number, portions: number, priceSingle: number, deliveryPerDay: number) =>
  totals(days * portions * priceSingle, days * deliveryPerDay);
/** Подписка (от 5 дней): обед = priceSub / minDays, доставка — за каждый день, как у разового. */
export const subTotals = (days: number, portions: number, priceSub: number, minDays: number, deliveryPerDay: number) =>
  totals(days * portions * Math.round(priceSub / minDays), days * deliveryPerDay);
