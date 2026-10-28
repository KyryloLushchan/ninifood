/**
 * Скидка на обеды (доставка без скидки). Сумма скидки округляется до 1 000 ₫ в пользу клиента
 * (т.е. сумма за обеды — вниз до 1 000), но не больше стоимости обедов. Копия: src/lib/pricing.ts (правки вносить в обе).
 */
export function discountAmount(food: number, percent: number): number {
  if (!(percent > 0) || !(food > 0)) return 0;
  return Math.min(food, Math.ceil((food * percent) / 100 / 1000) * 1000);
}
