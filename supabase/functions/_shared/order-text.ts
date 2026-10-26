import { esc } from './telegram.ts';
import { labelRu } from './dates.ts';

export const money = (n: number) => `${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} ₫`;

/** «Подписка 5 дн.» или «Подписка 5 дн. + 2 доп. (всего 7)». */
export const subLabel = (n: number) => (n <= 5 ? `Подписка ${n} дн.` : `Подписка 5 дн. + ${n - 5} доп. (всего ${n})`);

export interface OrderRow {
  order_number: string;
  type: 'single' | 'subscription';
  telegram: string;
  address: string;
  hotel: string | null;
  comment: string | null;
  payment_method: 'qr' | 'cash';
  qty: number;
  total: number;
  delivery_total: number;
  lang: string | null;
}

function telegramLink(raw: string): string {
  const h = raw.trim().replace(/^https?:\/\/(www\.)?t\.me\//i, '').replace(/^t\.me\//i, '').replace(/^@/, '');
  return /^[A-Za-z0-9_]{4,32}$/.test(h) ? `<a href="https://t.me/${h}">@${h}</a>` : esc(raw.trim());
}

export function buildOrderText(o: OrderRow, days: string[], statusLine?: string): string {
  const sorted = [...days].sort();
  const lines = [
    `🆕 <b>Заказ ${o.order_number}</b>`,
    '',
    `Тип: ${o.type === 'single' ? 'Разовый' : subLabel(days.length)}`,
    `📅 Дни: ${sorted.map(labelRu).join(' · ')}`,
    `🍽 Порций: ${o.qty} в день (всего ${o.qty * sorted.length})`,
    `🍱 Обеды: ${money(o.total - o.delivery_total)}`,
    `🚚 Доставка: ${money(o.delivery_total)}`,
    `💰 Итого: <b>${money(o.total)}</b>`,
    o.payment_method === 'qr'
      ? '💳 Оплата: QR (скриншот приложен)'
      : `💳 Оплата: наличными — к получению: <b>${money(o.total)}</b>`,
    '',
    `👤 Telegram: ${telegramLink(o.telegram)}`,
    `📍 Адрес: ${esc(o.address)}`,
  ];
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
