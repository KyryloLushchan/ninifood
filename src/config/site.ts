export const TIMEZONE = 'Asia/Ho_Chi_Minh';

export const PRICE_SINGLE = 170_000;
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
  telegramHandle: '@ninifoodvn',
  telegramUrl: 'https://t.me/ninifoodvn',
};

/** Реквизиты для VietQR (https://img.vietqr.io). Пока пусто — показывается плашка-заглушка. */
export const VIETQR = {
  bankId: '',
  accountNo: '',
  accountName: 'NINIFOOD',
};

export function buildQrUrl(amount: number): string | null {
  if (!VIETQR.bankId || !VIETQR.accountNo) return null;
  const q = new URLSearchParams({
    amount: String(amount),
    accountName: VIETQR.accountName,
  });
  return `https://img.vietqr.io/image/${VIETQR.bankId}-${VIETQR.accountNo}-compact2.png?${q}`;
}

/** Группа Orders (id не секретный): нужен для ссылок на сообщения заказов в админке. */
export const ORDERS_CHAT_ID = -1004499305461;
export const orderMessageUrl = (messageId: number) =>
  `https://t.me/c/${String(ORDERS_CHAT_ID).replace(/^-100/, '')}/${messageId}`;
