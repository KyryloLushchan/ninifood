// Тексты сообщения о заказе в группе Orders и уведомлений по заказу — на языке заказа (orders.lang: ru/ua/en/vi; нет языка — ru).
// Кнопки управления (✅ Подтвердить / ❌ Отклонить / ↩️ Отменить) и отчёты курьеру/кухне — по-русски, здесь их нет.
import { dayOfWeek } from './dates.ts';

export type OrderLang = 'ru' | 'ua' | 'en' | 'vi';
export const orderLang = (l: string | null | undefined): OrderLang => (l === 'ua' || l === 'en' || l === 'vi' ? l : 'ru');

interface Dict {
  wd: string[];
  title: string;
  type: string;
  once: string;
  /** Подписка: n дней (n ≤ 5) / с допами. */
  sub: (n: number) => string;
  subExtra: (n: number) => string;
  days: string;
  portions: (qty: number, total: number) => string;
  cutlery: string;
  lunches: string;
  discount: (p: number | undefined) => string;
  delivery: string;
  total: string;
  payQr: string;
  payOther: string;
  payCash: string;
  telegram: string;
  open: string;
  address: string;
  map: string;
  hotel: string;
  comment: string;
  confirmed: string;
  cancelled: string;
  rejected: string;
  /** Заказ восстановлен из отмены (строка статуса и уведомление). */
  restored: string;
  thanks: string;
  /** Уведомления по заказу. */
  portionsChanged: (n: string, a: number, b: number, money: string) => string;
  surcharge: string;
  refund: string;
  noSurcharge: string;
  addressChanged: (n: string, from: string, to: string) => string;
}

const D: Record<OrderLang, Dict> = {
  ru: {
    wd: ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'],
    title: 'Заказ',
    type: 'Тип',
    once: 'Разовый',
    sub: (n) => `Подписка ${n} дн.`,
    subExtra: (n) => `Подписка 5 дн. + ${n - 5} доп. (всего ${n})`,
    days: 'Дни',
    portions: (q, t) => `Порций: <b>${q} в день</b> (всего ${t})`,
    cutlery: 'Приборы: да',
    lunches: 'Обеды',
    discount: (p) => `Скидка ${p}%`,
    delivery: 'Доставка',
    total: 'Итого',
    payQr: 'Оплата: QR (скриншот приложен)',
    payOther: 'Оплата: другой способ (скриншот приложен)',
    payCash: 'Оплата: наличными — к получению:',
    telegram: 'Telegram',
    open: 'открыть',
    address: 'Адрес',
    map: 'Карта',
    hotel: 'Отель',
    comment: 'Комментарий',
    confirmed: '✅ Подтверждён',
    cancelled: '❌ Отменён',
    rejected: '❌ Отклонён',
    restored: '♻️ Восстановлен',
    thanks: 'Спасибо за заказ! 🙏',
    portionsChanged: (n, a, b, m) => `✏️ Изменён заказ ${n}: ${a} → ${b} порций, ${m}`,
    surcharge: 'доплата',
    refund: 'возврат',
    noSurcharge: 'без доплаты',
    addressChanged: (n, f, t) => `📍 Изменён адрес ${n}: ${f} → ${t}`,
  },
  ua: {
    wd: ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'],
    title: 'Замовлення',
    type: 'Тип',
    once: 'Разове',
    sub: (n) => `Підписка ${n} дн.`,
    subExtra: (n) => `Підписка 5 дн. + ${n - 5} дод. (всього ${n})`,
    days: 'Дні',
    portions: (q, t) => `Порцій: <b>${q} на день</b> (разом ${t})`,
    cutlery: 'Прибори: так',
    lunches: 'Обіди',
    discount: (p) => `Знижка ${p}%`,
    delivery: 'Доставка',
    total: 'Разом',
    payQr: 'Оплата: QR (скріншот додано)',
    payOther: 'Оплата: інший спосіб (скріншот додано)',
    payCash: 'Оплата: готівкою — до отримання:',
    telegram: 'Telegram',
    open: 'відкрити',
    address: 'Адреса',
    map: 'Мапа',
    hotel: 'Готель',
    comment: 'Коментар',
    confirmed: '✅ Підтверджено',
    cancelled: '❌ Скасовано',
    rejected: '❌ Відхилено',
    restored: '♻️ Відновлено',
    thanks: 'Дякуємо за замовлення! 🙏',
    portionsChanged: (n, a, b, m) => `✏️ Змінено замовлення ${n}: ${a} → ${b} порцій, ${m}`,
    surcharge: 'доплата',
    refund: 'повернення',
    noSurcharge: 'без доплати',
    addressChanged: (n, f, t) => `📍 Змінено адресу ${n}: ${f} → ${t}`,
  },
  en: {
    wd: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    title: 'Order',
    type: 'Type',
    once: 'One-time',
    sub: (n) => `Subscription ${n} days`,
    subExtra: (n) => `Subscription 5 days + ${n - 5} extra (${n} total)`,
    days: 'Days',
    portions: (q, t) => `Portions: <b>${q} per day</b> (${t} total)`,
    cutlery: 'Cutlery: yes',
    lunches: 'Lunches',
    discount: (p) => `Discount ${p}%`,
    delivery: 'Delivery',
    total: 'Total',
    payQr: 'Payment: QR (screenshot attached)',
    payOther: 'Payment: other method (screenshot attached)',
    payCash: 'Payment: cash — to collect:',
    telegram: 'Telegram',
    open: 'open',
    address: 'Address',
    map: 'Map',
    hotel: 'Hotel',
    comment: 'Comment',
    confirmed: '✅ Confirmed',
    cancelled: '❌ Cancelled',
    rejected: '❌ Rejected',
    restored: '♻️ Restored',
    thanks: 'Thank you for your order! 🙏',
    portionsChanged: (n, a, b, m) => `✏️ Order ${n} changed: ${a} → ${b} portions, ${m}`,
    surcharge: 'surcharge',
    refund: 'refund',
    noSurcharge: 'no surcharge',
    addressChanged: (n, f, t) => `📍 Address changed ${n}: ${f} → ${t}`,
  },
  vi: {
    wd: ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'],
    title: 'Đơn hàng',
    type: 'Loại',
    once: 'Đặt lẻ',
    sub: (n) => `Gói ${n} ngày`,
    subExtra: (n) => `Gói 5 ngày + ${n - 5} ngày thêm (tổng ${n})`,
    days: 'Ngày',
    portions: (q, t) => `Số suất: <b>${q} mỗi ngày</b> (tổng ${t})`,
    cutlery: 'Dụng cụ ăn: có',
    lunches: 'Bữa trưa',
    discount: (p) => `Giảm giá ${p}%`,
    delivery: 'Giao hàng',
    total: 'Tổng cộng',
    payQr: 'Thanh toán: QR (đã đính kèm ảnh chụp)',
    payOther: 'Thanh toán: cách khác (đã đính kèm ảnh chụp)',
    payCash: 'Thanh toán: tiền mặt — cần thu:',
    telegram: 'Telegram',
    open: 'mở',
    address: 'Địa chỉ',
    map: 'Bản đồ',
    hotel: 'Khách sạn',
    comment: 'Ghi chú',
    confirmed: '✅ Đã xác nhận',
    cancelled: '❌ Đã hủy',
    rejected: '❌ Đã từ chối',
    restored: '♻️ Đã khôi phục',
    thanks: 'Cảm ơn bạn đã đặt hàng! 🙏',
    portionsChanged: (n, a, b, m) => `✏️ Đã đổi đơn ${n}: ${a} → ${b} suất, ${m}`,
    surcharge: 'phụ thu',
    refund: 'hoàn tiền',
    noSurcharge: 'không phụ thu',
    addressChanged: (n, f, t) => `📍 Đã đổi địa chỉ ${n}: ${f} → ${t}`,
  },
};

export const dict = (lang: string | null | undefined): Dict => D[orderLang(lang)];

/** «Сб 24.10» / «Sat 24.10» / «T7 24.10» на языке заказа. */
export const dayLabel = (iso: string, lang: string | null | undefined) => `${dict(lang).wd[dayOfWeek(iso)]} ${iso.slice(8, 10)}.${iso.slice(5, 7)}`;

/** Статус в сообщении заказа: confirmed / cancelled (отмена подтверждённого) / rejected (отказ новому). */
export const statusLabel = (kind: 'confirmed' | 'cancelled' | 'rejected' | 'restored', lang: string | null | undefined) => dict(lang)[kind];

/** Часть уведомления об изменении порций: «доплата 20 000 ₫» / «возврат −20 000 ₫» / «без доплаты». */
export const diffLine = (diff: number, moneyText: string, lang: string | null | undefined) => {
  const d = dict(lang);
  return diff > 0 ? `${d.surcharge} ${moneyText}` : diff < 0 ? `${d.refund} ${moneyText}` : d.noSurcharge;
};
