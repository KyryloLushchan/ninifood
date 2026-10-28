import { esc } from './telegram.ts';
import { labelRu } from './dates.ts';

export const money = (n: number) => `${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} ₫`;

/** «Подписка 5 дн.» или «Подписка 5 дн. + 2 доп. (всего 7)». */
export const subLabel = (n: number) => (n <= 5 ? `Подписка ${n} дн.` : `Подписка 5 дн. + ${n - 5} доп. (всего ${n})`);

export interface OrderRow {
  order_number: string;
  type: 'single' | 'subscription';
  telegram: string;
  phone?: string | null;
  address: string;
  place_id?: string | null;
  lat?: number | null;
  lng?: number | null;
  hotel: string | null;
  comment: string | null;
  payment_method: 'qr' | 'cash' | 'other';
  qty: number;
  total: number;
  delivery_total: number;
  lang: string | null;
  is_vip?: boolean;
}

/** Ссылка на Google Maps по координатам (и place_id, если есть); null — координат нет. */
export function mapUrl(lat: number | null | undefined, lng: number | null | undefined, placeId?: string | null): string | null {
  if (lat == null || lng == null) return null;
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}${placeId ? `&query_place_id=${encodeURIComponent(placeId)}` : ''}`;
}

/** HTML-ссылка «📍 Карта» для сообщений Telegram; пустая строка, если координат нет. */
export const mapLinkHtml = (lat: number | null | undefined, lng: number | null | undefined, placeId?: string | null) => {
  const u = mapUrl(lat, lng, placeId);
  return u ? `<a href="${u.replace(/&/g, '&amp;')}">📍 Карта</a>` : '';
};

/** «+84901234567» → «+84 90 123 45 67» (другой формат — как есть). */
export function phoneText(stored: string): string {
  const m = /^\+84(\d{2})(\d{3})(\d{2})(\d{2})$/.exec(stored.trim());
  return m ? `+84 ${m[1]} ${m[2]} ${m[3]} ${m[4]}` : stored.trim();
}

function telegramLink(raw: string): string {
  const h = raw.trim().replace(/^https?:\/\/(www\.)?t\.me\//i, '').replace(/^t\.me\//i, '').replace(/^@/, '');
  return /^[A-Za-z0-9_]{4,32}$/.test(h) ? `<a href="https://t.me/${h}">@${h}</a>` : esc(raw.trim());
}

export function buildOrderText(o: OrderRow, days: string[], statusLine?: string): string {
  const sorted = [...days].sort();
  const lines = [
    `🆕 <b>Заказ ${o.order_number}</b>${o.is_vip ? ' ⭐ VIP' : ''}`,
    '',
    `Тип: ${o.type === 'single' ? 'Разовый' : subLabel(days.length)}`,
    `📅 Дни: ${sorted.map(labelRu).join(' · ')}`,
    `🍽 Порций: ${o.qty} в день (всего ${o.qty * sorted.length})`,
    `🍱 Обеды: ${money(o.total - o.delivery_total)}`,
    `🚚 Доставка: ${money(o.delivery_total)}`,
    `💰 Итого: <b>${money(o.total)}</b>`,
    o.payment_method === 'qr'
      ? '💳 Оплата: QR (скриншот приложен)'
      : o.payment_method === 'other'
        ? '💳 Оплата: другой способ (скриншот приложен)'
        : `💳 Оплата: наличными — к получению: <b>${money(o.total)}</b>`,
    '',
    `👤 Telegram: ${telegramLink(o.telegram)}`,
    ...(o.phone ? [`📞 ${esc(phoneText(o.phone))}`] : []),
    `📍 Адрес: ${esc(o.address)}`,
  ];
  const map = mapLinkHtml(o.lat, o.lng, o.place_id);
  if (map) lines.push(map);
  if (o.hotel) lines.push(`🏨 Отель: ${esc(o.hotel)}`);
  if (o.comment) lines.push(`💬 Комментарий: ${esc(o.comment)}`);
  lines.push(`🌐 Язык: ${(o.lang ?? '—').toUpperCase()}`);
  if (statusLine) lines.push('', statusLine);
  return lines.join('\n');
}

/** Длина подписи без HTML-тегов (лимит Telegram — 1024 символа после разбора). */
export const plainLength = (html: string) => html.replace(/<[^>]+>/g, '').replace(/&(amp|lt|gt);/g, '_').length;

export const keyboardNew = (n: string) => ({
  inline_keyboard: [[
    { text: '✅ Подтвердить', callback_data: `c:${n}` },
    { text: '❌ Отклонить', callback_data: `x:${n}` },
  ]],
});
export const keyboardConfirmed = (n: string) => ({
  inline_keyboard: [[{ text: '↩️ Отменить', callback_data: `x:${n}` }]],
});
export const keyboardNone = { inline_keyboard: [] as unknown[] };
