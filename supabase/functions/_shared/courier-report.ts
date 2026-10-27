import { esc } from './telegram.ts';
import { labelRu } from './dates.ts';
import { mapLinkHtml, money, phoneText, subLabel } from './order-text.ts';

export interface ReportDelivery {
  order_number: string;
  telegram: string;
  phone?: string | null;
  address: string;
  place_id?: string | null;
  lat?: number | null;
  lng?: number | null;
  hotel: string | null;
  comment: string | null;
  payment_method: 'qr' | 'cash';
  total: number;
  qty: number; // порции за этот день (order_days.qty)
  /** Для подписки: сколько всего дней в заказе и номер этого дня; для разового — null. */
  sub: { total: number; dayNo: number } | null;
  firstDay: boolean; // первый день доставки заказа — наличные берём только в него
}

const TG_LIMIT = 4096;
const SAFE = 3900; // запас под заголовок и теги

const handle = (raw: string) => {
  const h = raw.trim().replace(/^https?:\/\/(www\.)?t\.me\//i, '').replace(/^t\.me\//i, '').replace(/^@/, '');
  return /^[A-Za-z0-9_]{4,32}$/.test(h) ? `@${h}` : raw.trim();
};

const portions = (n: number) => {
  const m10 = n % 10;
  const m100 = n % 100;
  const w = m10 === 1 && m100 !== 11 ? 'порция' : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? 'порции' : 'порций';
  return `${n} ${w}`;
};

const cashDue = (d: ReportDelivery) => (d.payment_method === 'cash' && d.firstDay ? d.total : 0);

function entry(d: ReportDelivery, i: number): string {
  const due = cashDue(d);
  const lines = [`<b>${i + 1}. ${esc(d.order_number)}</b> · ${esc(handle(d.telegram))}`, `📍 <code>${esc(d.address)}</code>`];
  const map = mapLinkHtml(d.lat, d.lng, d.place_id);
  if (map) lines.push(map);
  if (d.hotel) lines.push(`🏨 ${esc(d.hotel)}`);
  if (d.phone) lines.push(`📞 ${esc(phoneText(d.phone))}`);
  if (d.sub) lines.push(`🔁 ${subLabel(d.sub.total)} · день ${d.sub.dayNo} из ${d.sub.total}`);
  lines.push(`🍽 ${portions(d.qty)}`);
  lines.push(due ? `💵 Взять наличными: <b>${money(due)}</b>` : '✅ Оплачено');
  if (d.comment) lines.push(`💬 ${esc(d.comment)}`);
  return lines.join('\n');
}

/** Текст(ы) отчёта на дату; при длине > 4096 режется по границам записей. */
export function buildCourierReport(date: string, deliveries: ReportDelivery[], from: string, to: string): string[] {
  const label = labelRu(date);
  if (deliveries.length === 0) return [`На ${label} доставок нет`];

  const list = [...deliveries].sort((a, b) => a.order_number.localeCompare(b.order_number));
  const cash = list.reduce((s, d) => s + cashDue(d), 0);
  const head = [
    `📦 <b>Доставки на ${label} — ${from}–${to}</b>`,
    `Адресов: ${list.length} · Порций: ${list.reduce((s, d) => s + d.qty, 0)} · Наличными: ${money(cash)}`,
  ].join('\n');

  const chunks: string[] = [];
  let cur = head;
  for (const [i, d] of list.entries()) {
    const e = entry(d, i);
    if (cur.length + 2 + e.length > SAFE && cur !== head) {
      chunks.push(cur);
      cur = e;
    } else cur += `\n\n${e}`;
  }
  chunks.push(cur);
  return chunks.map((c) => (c.length > TG_LIMIT ? c.slice(0, TG_LIMIT) : c));
}
