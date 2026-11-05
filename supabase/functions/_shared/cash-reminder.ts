// Напоминание в Orders (17:00 Дананг): точки СЕГОДНЯШНЕГО дня с наличными, которые курьер должен был забрать (первый день доставки наличного заказа), но доставка ещё не закрыта админом.
import { labelRu } from './dates.ts';
import { money } from './order-text.ts';
import { esc } from './telegram.ts';

export interface UnclosedCash {
  order_number: string;
  telegram: string;
  total: number;
  /** Курьер отметил точку в Telegram (courier_marked_at), но админ ещё не закрыл. */
  markedAt: string | null;
}

const hm = (iso: string) => new Intl.DateTimeFormat('ru-RU', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));
const nick = (raw: string) => {
  const h = raw.trim().replace(/^https?:\/\/(www\.)?t\.me\//i, '').replace(/^t\.me\//i, '').replace(/^@/, '');
  return /^[A-Za-z0-9_]{4,32}$/.test(h) ? `@${h}` : raw.trim();
};

/** Незакрытые наличные на дату: подтверждённые наличные заказы, у которых date — первый день доставки и день не отмечен «Доставлено». */
export async function loadUnclosedCash(db: any, date: string): Promise<UnclosedCash[]> {
  const { data, error } = await db
    .from('order_days')
    .select('delivered, courier_marked_at, orders!inner(order_number, telegram, total, status, payment_method, order_days(delivery_date))')
    .eq('delivery_date', date)
    .eq('delivered', false)
    .eq('orders.payment_method', 'cash')
    .eq('orders.status', 'confirmed');
  if (error) throw new Error(error.message);
  return ((data ?? []) as any[])
    .filter((r) => [...r.orders.order_days].map((d: any) => d.delivery_date).sort()[0] === date)
    .map((r) => ({ order_number: r.orders.order_number, telegram: r.orders.telegram, total: Number(r.orders.total) || 0, markedAt: r.courier_marked_at ?? null }))
    .sort((a, b) => a.order_number.localeCompare(b.order_number, 'en', { numeric: true }));
}

const MAX_LINES = 40;
export function buildCashReminder(date: string, list: UnclosedCash[]): string {
  const sum = list.reduce((s, x) => s + x.total, 0);
  const lines = [`⏰ <b>Не закрыты наличные за ${labelRu(date).replace(' ', ', ')}</b>`, `Точек: ${list.length} · к получению: <b>${money(sum)}</b>`, ''];
  for (const x of list.slice(0, MAX_LINES)) lines.push(`• ${esc(nick(x.telegram))} · ${esc(x.order_number)} — ${money(x.total)} · ${x.markedAt ? `🚴 курьер отметил ${hm(x.markedAt)}` : 'не отмечено'}`);
  if (list.length > MAX_LINES) lines.push(`… и ещё ${list.length - MAX_LINES}`);
  lines.push('', 'Закройте в админке → «Курьер» («Доставлено» или «Закрыть все отмеченные курьером»), чтобы деньги попали в кассу.');
  return lines.join('\n');
}
