import { esc } from './telegram.ts';
import { dayLabel, dict } from './order-i18n.ts';

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
  discount_percent?: number;
  discount_amount?: number;
  lang: string | null;
  /** Одноразовые приборы (бесплатно). */
  cutlery?: boolean;
  is_vip?: boolean;
}

/** Ссылка на Google Maps по координатам (и place_id, если есть); null — координат нет. */
export function mapUrl(lat: number | null | undefined, lng: number | null | undefined, placeId?: string | null): string | null {
  if (lat == null || lng == null) return null;
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}${placeId ? `&query_place_id=${encodeURIComponent(placeId)}` : ''}`;
}

/** HTML-ссылка «📍 Карта» для сообщений Telegram; пустая строка, если координат нет. */
export const mapLinkHtml = (lat: number | null | undefined, lng: number | null | undefined, placeId?: string | null, label = 'Карта') => {
  const u = mapUrl(lat, lng, placeId);
  return u ? `<a href="${u.replace(/&/g, '&amp;')}">📍 ${label}</a>` : '';
};

/** «+84901234567» → «+84 90 123 45 67» (другой формат — как есть). */
export function phoneText(stored: string): string {
  const m = /^\+84(\d{2})(\d{3})(\d{2})(\d{2})$/.exec(stored.trim());
  return m ? `+84 ${m[1]} ${m[2]} ${m[3]} ${m[4]}` : stored.trim();
}

/** Ник в <code> (копируется одним нажатием; внутри code ссылки невозможны, поэтому рядом — «открыть»). */
function telegramLink(raw: string, open = 'открыть'): string {
  const h = raw.trim().replace(/^https?:\/\/(www\.)?t\.me\//i, '').replace(/^t\.me\//i, '').replace(/^@/, '');
  return /^[A-Za-z0-9_]{4,32}$/.test(h) ? `<code>@${h}</code> · <a href="https://t.me/${h}">${open}</a>` : `<code>${esc(raw.trim())}</code>`;
}

/** Время доставки из settings (`delivery_from`, `delivery_to`, «ЧЧ:ММ») → «13:00–16:00»; нет/неверно — null (в сообщении времени не будет). */
export async function getDeliveryHours(db: any): Promise<string | null> {
  const { data } = await db.from('settings').select('key, value').in('key', ['delivery_from', 'delivery_to']);
  const v = Object.fromEntries((data ?? []).map((r: { key: string; value: string }) => [r.key, String(r.value).trim()]));
  const re = /^([01]?\d|2[0-3]):[0-5]\d$/;
  return re.test(v.delivery_from ?? '') && re.test(v.delivery_to ?? '') ? `${v.delivery_from}–${v.delivery_to}` : null;
}

/** Сообщение о заказе в группе Orders — целиком на языке заказа (`o.lang`: ru/ua/en/vi; нет языка — ru). statusLine — уже готовая строка статуса (✅/❌ — кто, когда). */
export function buildOrderText(o: OrderRow, days: string[], statusLine?: string, hours?: string | null): string {
  const d = dict(o.lang);
  const sorted = [...days].sort();
  const lines = [
    `🆕 <b>${d.title} ${o.order_number}</b>${o.is_vip ? ' ⭐ VIP' : ''}`,
    '',
    `${d.type}: ${o.type === 'single' ? d.once : sorted.length <= 5 ? d.sub(sorted.length) : d.subExtra(sorted.length)}`,
    `📅 ${d.days}: ${sorted.map((x) => dayLabel(x, o.lang)).join(' · ')}${hours ? ` — ${d.deliveryWord} ${hours}` : ''}`,
    `🍽 ${d.portions(o.qty, o.qty * sorted.length)}`,
    ...(o.cutlery ? [`🍴 ${d.cutlery}`] : []),
    `🍱 ${d.lunches}: ${money(o.total - o.delivery_total + (o.discount_amount ?? 0))}`,
    ...(o.discount_amount ? [`🏷 ${d.discount(o.discount_percent)}: −${money(o.discount_amount)}`] : []),
    `🚚 ${d.delivery}: ${money(o.delivery_total)}`,
    `💰 ${d.total}: <b>${money(o.total)}</b>`,
    o.payment_method === 'qr' ? `💳 ${d.payQr}` : o.payment_method === 'other' ? `💳 ${d.payOther}` : `💳 ${d.payCash} <b>${money(o.total)}</b>`,
    '',
    `👤 ${d.telegram}: ${telegramLink(o.telegram, d.open)}`,
    ...(o.phone ? [`📞 <code>${esc(phoneText(o.phone))}</code>`] : []),
    `📍 ${d.address}: <code>${esc(o.address)}</code>`,
  ];
  const map = mapLinkHtml(o.lat, o.lng, o.place_id, d.map);
  if (map) lines.push(map);
  if (o.hotel) lines.push(`🏨 ${d.hotel}: ${esc(o.hotel)}`);
  if (o.comment) lines.push(`💬 ${d.comment}: ${esc(o.comment)}`);
  if (statusLine) lines.push('', statusLine);
  lines.push('', d.thanks);
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
