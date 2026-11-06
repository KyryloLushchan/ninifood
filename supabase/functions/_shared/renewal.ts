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
  /** Язык заказа (`orders.lang`: ua/ru/en/vi), null — RU. */
  lang?: string | null;
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
  /** Язык клиента (по ПОСЛЕДНЕМУ заказу, у которого он есть), null — RU. */
  lang: string | null;
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
        lang: [...sorted].reverse().find((o) => o.lang)?.lang ?? null,
      };
    })
    .sort((a, b) => byNumber({ order_number: a.orders[0] }, { order_number: b.orders[0] }));
}

/** Код языка в ссылке: ?lang=ru|uk|en|vi (`ua` в заказах → `uk`); нет языка — ru. */
export const linkLang = (lang: string | null | undefined) => (lang === 'ua' || lang === 'uk' ? 'uk' : lang === 'en' ? 'en' : lang === 'vi' ? 'vi' : 'ru');

/** Ссылка клиенту: сайт на языке заказа, сразу экран заказа «Подписка». */
export const renewalLink = (lang?: string | null) => `${SITE_URL}/?lang=${linkLang(lang)}#subscription`;

/** Текст клиенту (дословно по ТЗ) на языке заказа (ru/ua/en/vi; нет языка — ru) и ссылка с ?lang=. */
const CLIENT_TEXT: Record<string, string> = {
  ru: 'Привет! Спасибо, что были с нами эту неделю 💛 Сегодня последний день вашей подписки NiniFood.\nНе оставайтесь без домашнего обеда — продлите подписку 👇',
  ua: 'Привіт! Дякуємо, що були з нами цього тижня 💛 Сьогодні останній день вашої підписки NiniFood.\nНе залишайтеся без домашнього обіду — продовжте підписку 👇',
  en: "Hi! Thanks for being with us this week 💛 Today is the last day of your NiniFood subscription.\nDon't miss out on a home-cooked lunch — renew your subscription 👇",
  vi: 'Xin chào! Cảm ơn bạn đã đồng hành cùng NiniFood tuần này 💛 Hôm nay là ngày cuối cùng của gói đăng ký.\nĐừng bỏ lỡ bữa trưa nhà làm — hãy gia hạn gói nhé 👇',
};
/** Группа отзывов NiniFood — одна константа на все сообщения (продление и «первый разовый»). */
export const REVIEWS_URL = 'https://t.me/+5WmNqxOYJuJhOWU6';
const lk = (lang?: string | null): 'ru' | 'ua' | 'en' | 'vi' => (lang === 'ua' || lang === 'uk' ? 'ua' : lang === 'en' ? 'en' : lang === 'vi' ? 'vi' : 'ru');
const REVIEWS_ASK: Record<'ru' | 'ua' | 'en' | 'vi', string> = {
  ru: 'Будем рады вашему отзыву 🙏 Присоединяйтесь к нашей группе: ',
  ua: 'Будемо раді вашому відгуку 🙏 Приєднуйтесь до нашої групи: ',
  en: "We'd love your feedback 🙏 Join our group: ",
  vi: 'Rất mong nhận được đánh giá của bạn 🙏 Tham gia nhóm của chúng tôi: ',
};
/** Текст продления подписки: приглашение + ссылка + пустая строка и абзац про отзывы. */
export const clientText = (lang?: string | null) => `${CLIENT_TEXT[lang === 'uk' ? 'ua' : (lang ?? '')] ?? CLIENT_TEXT.ru}\n${renewalLink(lang)}\n\n${REVIEWS_ASK[lk(lang)]}${REVIEWS_URL}`;

/** Цена обеда в подписке по-человечески для языка: 150 000 ₫ (ru/ua), 150,000 ₫ (en), 150.000 ₫ (vi). */
export const priceText = (lang: string | null | undefined, n: number) => {
  const g = String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, lk(lang) === 'en' ? ',' : lk(lang) === 'vi' ? '.' : ' ');
  return `${g} ₫`;
};
const FIRST_TXT: Record<'ru' | 'ua' | 'en' | 'vi', (price: string, link: string) => string> = {
  ru: (p, l) => `Привет! Надеемся, обед NiniFood вам понравился 😋🍲\nХотите домашний обед каждый день без забот? Оформите подписку от 5 дней — всего ${p} за обед 👇\n${l}\n\nПоделитесь впечатлениями в нашей группе отзывов 💬 ${REVIEWS_URL}`,
  ua: (p, l) => `Привіт! Сподіваємося, обід NiniFood вам сподобався 😋🍲\nХочете домашній обід щодня без клопотів? Оформіть підписку від 5 днів — лише ${p} за обід 👇\n${l}\n\nПоділіться враженнями в нашій групі відгуків 💬 ${REVIEWS_URL}`,
  en: (p, l) => `Hi! We hope you enjoyed your NiniFood lunch 😋🍲\nWant a home-cooked lunch every day, hassle-free? Get a subscription from 5 days — just ${p} per lunch 👇\n${l}\n\nShare your impressions in our reviews group 💬 ${REVIEWS_URL}`,
  vi: (p, l) => `Xin chào! Hy vọng bạn đã thích bữa trưa NiniFood 😋🍲\nMuốn có bữa trưa nhà làm mỗi ngày mà không phải lo nghĩ? Đăng ký gói từ 5 ngày — chỉ ${p} mỗi bữa 👇\n${l}\n\nChia sẻ cảm nhận của bạn trong nhóm đánh giá 💬 ${REVIEWS_URL}`,
};
/** Текст после ПЕРВОГО разового заказа (язык последнего заказа клиента; нет языка — ru); perLunch — цена обеда в подписке (price_subscription / 5). */
export const firstSingleText = (lang: string | null | undefined, perLunch: number) => FIRST_TXT[lk(lang)](priceText(lang, perLunch), renewalLink(lang));

export interface AnyOrder {
  id: string;
  order_number: string;
  telegram: string;
  phone: string | null;
  customer_id: string | null;
  created_at: string;
  lang: string | null;
  status: string;
  type: string;
  days: { delivery_date: string; qty: number }[];
}
export interface FirstNotice {
  nick: string | null;
  phone: string | null;
  customer_id: string | null;
}
export interface FirstSingle {
  nick: string;
  order_number: string;
  portions: number;
  lang: string | null;
  phone: string | null;
  customer_id: string | null;
}
const sameClient = (a: { telegram: string; phone: string | null; customer_id: string | null }, b: { telegram: string; phone: string | null; customer_id: string | null }) =>
  (!!nickKey(a.telegram) && nickKey(a.telegram) === nickKey(b.telegram)) || (!!a.phone && a.phone === b.phone) || (!!a.customer_id && a.customer_id === b.customer_id);

/**
 * Клиенты после ПЕРВОГО разового заказа: сегодня доставочный день самого первого заказа клиента (по нику/телефону/аккаунту; отменённые не считаем — all уже без них),
 * этот заказ разовый и подтверждён/доставлен, у клиента нет других дней доставки после сегодня (в том числе у этого же заказа), и уведомление ему ещё не отправляли (за всё время).
 */
export function selectFirstSingle(today: string, all: AnyOrder[], notices: FirstNotice[]): FirstSingle[] {
  const out: FirstSingle[] = [];
  const done = new Set<string>();
  for (const o of all) {
    if (o.type !== 'single' || !['confirmed', 'delivered'].includes(o.status) || !o.days.some((d) => d.delivery_date === today)) continue;
    const related = all.filter((x) => x.id === o.id || sameClient(x, o));
    const first = [...related].sort((a, b) => a.created_at.localeCompare(b.created_at) || byNumber(a, b))[0];
    if (first.id !== o.id) continue; // это не самый первый заказ клиента
    if (related.some((x) => x.days.some((d) => d.delivery_date > today))) continue; // есть заказы на ближайшие дни
    if (notices.some((n) => sameClient({ telegram: n.nick ?? '', phone: n.phone, customer_id: n.customer_id }, o))) continue; // уже отправляли
    const key = nickKey(o.telegram) || o.phone || o.customer_id || o.id;
    if (done.has(key)) continue;
    done.add(key);
    const lastLang = [...related].sort((a, b) => b.created_at.localeCompare(a.created_at)).find((x) => x.lang)?.lang ?? null;
    out.push({ nick: o.telegram, order_number: o.order_number, portions: o.days.filter((d) => d.delivery_date === today).reduce((s, d) => s + d.qty, 0) || 1, lang: lastLang, phone: o.phone, customer_id: o.customer_id });
  }
  return out.sort(byNumber2);
}
const byNumber2 = (a: { order_number: string }, b: { order_number: string }) => a.order_number.localeCompare(b.order_number, 'en', { numeric: true });

/** Сообщение «первый разовый»: первая строка по-русски, дальше текст на языке заказа. */
export const firstSingleMessage = (e: FirstSingle, perLunch: number) => `🆕 Первый разовый · ${esc(nickText(e.nick))} · ${esc(e.order_number)} — ${e.portions} ${portionsWord}\n\n${esc(firstSingleText(e.lang, perLunch))}`;

/** Ник для вывода: без пробелов, невидимых символов и t.me/; «@» добавляется, если ник валидный (5–32: латиница, цифры, _). В заказах не меняется. */
export function nickText(raw: string): string {
  const clean = raw
    .replace(/[\s\u00AD\u034F\u061C\u115F\u1160\u17B4\u17B5\u180B-\u180E\u200B-\u200F\u202A-\u202E\u2060-\u206F\u3164\uFE00-\uFE0F\uFEFF]/g, '')
    .replace(/^(https?:\/\/)?(www\.)?(t|telegram)\.me\//i, '')
    .replace(/^@+/, '')
    .replace(/[/?#].*$/, '');
  return /^[A-Za-z0-9_]{5,32}$/.test(clean) ? `@${clean}` : clean || raw.trim();
}
const portionsWord = 'порц.';

/** Отдельное сообщение одного клиента — обычный текст (без <code>): строка со сводкой, пустая строка, текст клиенту со ссылкой. Ник и ссылка кликабельны сами; телефона нет. */
export function entryMessage(e: Entry): string {
  return `🔔 ${esc(nickText(e.nick))} · ${esc(e.orders.join(' + '))} — ${e.days} дн., ${e.portions} ${portionsWord}\n\n${esc(clientText(e.lang))}`;
}
