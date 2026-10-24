import { PRICE_SINGLE, PRICE_SUB } from '@/config/site';

export type OrderType = 'once' | 'sub';

export const onceTotal = (days: number, portions: number) => days * portions * PRICE_SINGLE;
export const subTotal = (portions: number) => PRICE_SUB * portions;
