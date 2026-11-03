// Напоминание о продлении подписки: чистая логика отбора и текст сообщения (без БД и сети).
import { esc } from './telegram.ts';

export const SITE_URL = 'https://ninifoodvn.com';
const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
export const CODE_RE = /^[0-9A-Za-z]{22}$/;

/** 22 символа base62 (~131 бит) из crypto; байты ≥ 248 отбрасываем, чтобы не было смещения. */
export function newCode(): string {
  let out = '';
  while (out.length < 22) {
    for (const b of crypto.getRandomValues(new Uint8Array(32))) {
      if (b < 248 && out.length < 22) out += ALPHABET[b % 62];
    }
  }
  return out;
}

/** Ник Telegram без @ и ссылки, в нижнем регистре — ключ клиента. */
export const nickKey = (telegram: string) => telegram.trim().replace(/^https?:\/\/(www\.)?t\.me\//i, '').replace(/^t\.me\//i, '').replace(/^@/, '').toLowerCase();

export interface EndingOrder {
  id: string;
  order_number: string;
  telegram: string;
  phone: string | null;
  customer_id: string | null;
  /** Дни заказа и порции в последний день (сегодня). */
  daysCount: number;
  lastDay: string;
  lastQty: number;
}
export interface FutureOrder {
  telegram: string;
  phone: string | null;
  customer_id: string | null;
}
export interface Entry {
  nick: string;
  orders: string[];
  phone: string | null;
  days: number;
  portions: number;
  /** Заказ, к которому привязана ссылка продления (первый по номеру). */
  primaryId: string;
}

const byNumber = (a: { order_number: string }, b: { order_number: string }) => a.order_number.localeCompare(b.order_number, 'en', { numeric: true });

/**
 * Клиенты, у которых СЕГОДНЯ последний день подписки и нет заказа/подписки на ближайшие дни.
 * ending — подписки (confirmed/delivered), у которых последний день = сегодня; future — заказы (new/confirmed/delivered) с днями после сегодня.
 * «Тот же клиент» — по нику Telegram, телефону или аккаунту. Несколько заканчивающихся подписок одного клиента — одна запись.
 */
export function selectEntries(today: string, ending: EndingOrder[], future: FutureOrder[]): Entry[] {
  const fNick = new Set(future.map((f) => nickKey(f.telegram)).filter(Boolean));
  const fPhone = new Set(future.map((f) => f.phone).filter((x): x is string => !!x));
  const fCust = new Set(future.map((f) => f.customer_id).filter((x): x is string => !!x));
  const byClient = new Map<string, EndingOrder[]>();
  for (const o of ending) {
    if (o.lastDay !== today) continue;
    if (fNick.has(nickKey(o.telegram)) || (o.phone && fPhone.has(o.phone)) || (o.customer_id && fCust.has(o.customer_id))) continue;
    const k = nickKey(o.telegram) || o.id;
    byClient.set(k, [...(byClient.get(k) ?? []), o]);
  }
  return [...byClient.values()]
    .map((list) => {
      const sorted = [...list].sort(byNumber);
      return {
        nick: sorted[0].telegram,
        orders: sorted.map((o) => o.order_number),
        phone: sorted.find((o) => o.phone)?.phone ?? null,
        days: Math.max(...sorted.map((o) => o.daysCount)),
        portions: sorted.reduce((s, o) => s + o.lastQty, 0),
        primaryId: sorted[0].id,
      };
    })
    .sort((a, b) => byNumber({ order_number: a.orders[0] }, { order_number: b.orders[0] }));
}

/** Текст клиенту (дословно по ТЗ). Ссылка — просто адрес сайта, персональных ссылок нет. */
export const clientText = () =>
  `Привет! Спасибо, что были с нами эту неделю 💛 Сегодня последний день вашей подписки NiniFood.\nНе оставайтесь без домашнего обеда — продлите подписку 👇\nninifoodvn.com`;

const nickText = (raw: string) => {
  const h = raw.trim().replace(/^https?:\/\/(www\.)?t\.me\//i, '').replace(/^t\.me\//i, '').replace(/^@/, '');
  return /^[A-Za-z0-9_]{4,32}$/.test(h) ? `@${h}` : raw.trim();
};
const portionsWord = 'порц.';

/** Отдельное сообщение одного клиента: строка со сводкой и текст в <code> (копируется одним нажатием). Телефона нет. */
export function entryMessage(e: Entry): string {
  return `🔔 ${esc(nickText(e.nick))} · ${esc(e.orders.join(' + '))} — ${e.days} дн., ${e.portions} ${portionsWord}\n<code>${esc(clientText())}</code>`;
}
