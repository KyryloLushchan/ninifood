export type OrderType = 'once' | 'sub';

export interface Totals {
  food: number;
  delivery: number;
  total: number;
}

const totals = (food: number, delivery: number): Totals => ({ food, delivery, total: food + delivery });

/** Разовый: доставка — за каждый день доставки (не за порцию). */
export const onceTotals = (days: number, portions: number, priceSingle: number, deliverySingle: number) =>
  totals(days * portions * priceSingle, days * deliverySingle);
/** Подписка: доставка — фиксированно за всю подписку. */
export const subTotals = (portions: number, priceSub: number, deliverySub: number) => totals(priceSub * portions, deliverySub);
