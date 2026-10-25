export type OrderType = 'once' | 'sub';

export const onceTotal = (days: number, portions: number, priceSingle: number) => days * portions * priceSingle;
export const subTotal = (portions: number, priceSub: number) => priceSub * portions;
