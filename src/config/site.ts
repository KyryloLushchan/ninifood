export const TIMEZONE = 'Asia/Ho_Chi_Minh';

export const PRICE_SINGLE = 170_000;
export const PRICE_SUB = 750_000;
/** Доставка: за каждый день доставки (не за порцию), и для разового заказа, и для подписки. */
export const DELIVERY_SINGLE = 20_000;
/** Подписка — от 5 дней (Пн–Сб); обед в подписке = PRICE_SUB / SUB_MIN_DAYS. */
export const SUB_MIN_DAYS = 5;

/** Сколько ближайших дней доступно для разового заказа и показывается в меню. */
export const BOOKABLE_DAYS = 6;

/** Подписку можно оформить на дни Пн–Сб из ближайших N дней (кроме сегодня), даже если меню ещё не опубликовано. */
export const SUB_WINDOW_DAYS = 14;

export const DELIVERY_FROM = '14:00';
export const DELIVERY_TO = '16:00';

export const CONTACTS = {
  telegramHandle: '@ninifoodvn',
  telegramUrl: 'https://t.me/ninifoodvn',
};

/** Реквизиты для VietQR (https://img.vietqr.io; bankId — код банка по справочнику VietQR). Совпадают с public/photos/payment-qr.jpg. */
export const VIETQR = {
  bankId: 'BIDV',
  accountNo: '8827465948',
  accountName: 'LE NU NGOC HA',
};

/** QR с суммой и назначением платежа (шаблон compact2). Формат svg: png сервис теперь редиректит на svg. */
export function buildQrUrl(amount: number, note: string): string | null {
  if (!VIETQR.bankId || !VIETQR.accountNo) return null;
  const q = `amount=${amount}&addInfo=${encodeURIComponent(note)}&accountName=${encodeURIComponent(VIETQR.accountName)}`;
  return `https://img.vietqr.io/image/${VIETQR.bankId}-${VIETQR.accountNo}-compact2.svg?${q}`;
}

/** Группа Orders (id не секретный): нужен для ссылок на сообщения заказов в админке. */
export const ORDERS_CHAT_ID = -1004499305461;
export const orderMessageUrl = (messageId: number) =>
  `https://t.me/c/${String(ORDERS_CHAT_ID).replace(/^-100/, '')}/${messageId}`;
