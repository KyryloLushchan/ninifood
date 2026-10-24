export const TIMEZONE = 'Asia/Ho_Chi_Minh';

export const PRICE_SINGLE = 165_000;
export const PRICE_SUB = 750_000;
export const SUB_DAYS = 5;
export const PRICE_SUB_PER_DAY = PRICE_SUB / SUB_DAYS;

/** Сколько ближайших дней доступно для разового заказа и показывается в меню. */
export const BOOKABLE_DAYS = 6;

/** Подписку можно оформить на будние дни из ближайших N дней (кроме сегодня), даже если меню ещё не опубликовано. */
export const SUB_WINDOW_DAYS = 14;

export const DELIVERY_FROM = '14:00';
export const DELIVERY_TO = '16:00';
export const TODAY_ORDER_DEADLINE = '10:00';

export const CONTACTS = {
  telegramHandle: '@ninifood_dn',
  telegramUrl: 'https://t.me/ninifood_dn',
  phone: '+84 90 000 00 00',
};

/** Реквизиты для VietQR (https://img.vietqr.io). Пока пусто — показывается плашка-заглушка. */
export const VIETQR = {
  bankId: '',
  accountNo: '',
  accountName: 'NINIFOOD',
};

export function buildQrUrl(amount: number, orderId: string): string | null {
  if (!VIETQR.bankId || !VIETQR.accountNo) return null;
  const q = new URLSearchParams({
    amount: String(amount),
    addInfo: orderId,
    accountName: VIETQR.accountName,
  });
  return `https://img.vietqr.io/image/${VIETQR.bankId}-${VIETQR.accountNo}-compact2.png?${q}`;
}
