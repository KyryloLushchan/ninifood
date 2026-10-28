/**
 * Все пути к фото — здесь. null = показывается полосатая плашка-заглушка.
 * Файлы класть в /public/photos и указывать как '/photos/xxx.jpg'.
 */
export const PHOTOS = {
  hero: '/photos/hero-800.webp' as string | null,
  /** Статический QR для оплаты (VietQR без суммы; сумма показана на экране). */
  paymentQr: '/photos/payment-qr.jpg',
  /** Фото блюда по умолчанию, если у блюда в меню нет своего. */
  dishFallback: null as string | null,
};
