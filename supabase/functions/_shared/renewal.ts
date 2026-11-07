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
  customer_id: string | null;
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
        customer_id: sorted.find((o) => o.customer_id)?.customer_id ?? null,
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
/** Телефон для сравнения: только цифры, без кода страны 84 и ведущего 0 («+84 90 123 45 67» = «0901234567»); короче 7 цифр — не телефон. */
export const phoneKey = (phone: string | null | undefined) => {
  const d = (phone ?? '').replace(/\D/g, '').replace(/^84/, '').replace(/^0+/, '');
  return d.length >= 7 ? d : '';
};
const sameClient = (a: { telegram: string; phone: string | null; customer_id: string | null }, b: { telegram: string; phone: string | null; customer_id: string | null }) =>
  (!!nickKey(a.telegram) && nickKey(a.telegram) === nickKey(b.telegram)) || (!!phoneKey(a.phone) && phoneKey(a.phone) === phoneKey(b.phone)) || (!!a.customer_id && a.customer_id === b.customer_id);

/**
 * Клиенты после ЕДИНСТВЕННОГО разового заказа: у клиента (ник без регистра и @ / нормализованный телефон / аккаунт) за всё время нет НИ ОДНОГО другого заказа — разового или подписки,
 * в любом статусе кроме отменённого (all уже без отменённых); этот заказ разовый, подтверждён/доставлен, короче подписки (< 5 дней: «разовый» на 5+ дней — по сути подписка, ей положено «продление»),
 * сегодня его доставочный день и дальше дней нет, и уведомление клиенту ещё не отправляли (за всё время).
 */
/** Подписка — от 5 дней (как `SUB_MIN_DAYS` на сайте). */
const SUB_MIN_DAYS = 5;
export function selectFirstSingle(today: string, all: AnyOrder[], notices: FirstNotice[]): FirstSingle[] {
  const out: FirstSingle[] = [];
  const done = new Set<string>();
  for (const o of all) {
    if (o.type !== 'single' || !['confirmed', 'delivered'].includes(o.status) || !o.days.some((d) => d.delivery_date === today)) continue;
    const related = all.filter((x) => x.id === o.id || sameClient(x, o));
    if (related.some((x) => x.id !== o.id)) continue; // у клиента есть другой заказ — это не «первый разовый»
    if (o.days.length >= SUB_MIN_DAYS) continue; // 5+ дней — это подписка по размеру
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

/** Сообщение «первый разовый»: первая строка — только ник, пустая строка, текст клиенту на языке заказа. */
export const firstSingleMessage = (e: FirstSingle, perLunch: number) => `${esc(nickText(e.nick))}\n\n${esc(firstSingleText(e.lang, perLunch))}`;

/** Ник для вывода: без пробелов, невидимых символов и t.me/; «@» добавляется, если ник валидный (5–32: латиница, цифры, _). В заказах не меняется. */
export function nickText(raw: string): string {
  const clean = raw
    .replace(/[\s\u00AD\u034F\u061C\u115F\u1160\u17B4\u17B5\u180B-\u180E\u200B-\u200F\u202A-\u202E\u2060-\u206F\u3164\uFE00-\uFE0F\uFEFF]/g, '')
    .replace(/^(https?:\/\/)?(www\.)?(t|telegram)\.me\//i, '')
    .replace(/^@+/, '')
    .replace(/[/?#].*$/, '');
  return /^[A-Za-z0-9_]{5,32}$/.test(clean) ? `@${clean}` : clean || raw.trim();
}

/** Сообщение о продлении: первая строка — только ник, пустая строка, текст клиенту со ссылкой (обычный текст, без <code>; копируется целиком). */
export function entryMessage(e: Entry): string {
  return `${esc(nickText(e.nick))}\n\n${esc(clientText(e.lang))}`;
}

// ── Повторное напоминание: через 2 дня после напоминания о продлении / «первого разового», если клиент так и не заказал ──
export interface SentReminder {
  id: number;
  kind: 'renewal' | 'first_single';
  nick: string | null;
  phone: string | null;
  customer_id: string | null;
  order_number: string;
  sent_at: string;
  followup_at: string | null;
}
export interface ClientOrder {
  telegram: string;
  phone: string | null;
  customer_id: string | null;
  created_at: string;
  lang: string | null;
  status: string;
}
export interface Followup {
  reminder: SentReminder;
  /** true — повторное не шлём (клиент уже заказал или это второе напоминание того же клиента); строку всё равно помечаем обработанной. */
  skip: boolean;
  nick: string;
  lang: string | null;
}
/** Дата Дананга (UTC+7) для момента времени, ISO YYYY-MM-DD. */
export const danangDate = (ts: string | number) => new Date(new Date(ts).getTime() + 7 * 3600_000).toISOString().slice(0, 10);
const addDays = (iso: string, n: number) => new Date(new Date(`${iso}T00:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);

/**
 * Что делать с отправленными напоминаниями сегодня (13:00 Дананг): срок — дата напоминания + 2 дня (опоздавшие запуски догоняем до +4 дней), повторное один раз (followup_at пуст).
 * Клиент (по нику/телефону/аккаунту) сделал после напоминания любой заказ кроме отменённого — skip. orders — все заказы клиентов (любой статус).
 */
export function selectFollowups(today: string, sent: SentReminder[], orders: ClientOrder[]): Followup[] {
  const out: Followup[] = [];
  const seen = new Set<string>();
  for (const r of sent) {
    if (r.followup_at) continue;
    const due = addDays(danangDate(r.sent_at), 2);
    if (today < due || today > addDays(due, 2)) continue;
    const me = { telegram: r.nick ?? '', phone: r.phone, customer_id: r.customer_id };
    const mine = orders.filter((o) => sameClient(me, o));
    // у клиента два напоминания (например, продление и первый разовый) — повторное одно, вторая запись просто закрывается
    const key = nickKey(me.telegram) || me.phone || me.customer_id || String(r.id);
    const skip = mine.some((o) => o.status !== 'cancelled' && o.created_at > r.sent_at) || seen.has(key);
    if (!skip) seen.add(key);
    const lang = [...mine].filter((o) => o.status !== 'cancelled').sort((a, b) => b.created_at.localeCompare(a.created_at)).find((o) => o.lang)?.lang ?? null;
    out.push({ reminder: r, skip, nick: me.telegram, lang });
  }
  return out;
}

const AGAIN_TXT: Record<'ru' | 'ua' | 'en' | 'vi', (link: string, group: string) => string> = {
  ru: (l, g) => `Голодны? 😋🍲 А ведь могли бы уже наслаждаться вкусным домашним обедом от NiniFood! 🥗🍛✨\nЗакажите на завтра — мы всё приготовим и привезём 🛵💨\n👉 ${l}\n\nЗагляните в отзывы наших гостей 💬⭐ ${g}`,
  ua: (l, g) => `Голодні? 😋🍲 А могли б уже насолоджуватися смачним домашнім обідом від NiniFood! 🥗🍛✨\nЗамовте на завтра — ми все приготуємо й привеземо 🛵💨\n👉 ${l}\n\nЗазирніть у відгуки наших гостей 💬⭐ ${g}`,
  en: (l, g) => `Hungry? 😋🍲 You could already be enjoying a delicious home-cooked lunch from NiniFood! 🥗🍛✨\nOrder for tomorrow — we'll cook it and bring it to you 🛵💨\n👉 ${l}\n\nCheck out what our guests say 💬⭐ ${g}`,
  vi: (l, g) => `Đói bụng chưa? 😋🍲 Bạn đã có thể thưởng thức bữa trưa nhà làm thơm ngon từ NiniFood rồi đấy! 🥗🍛✨\nĐặt cho ngày mai nhé — chúng tôi sẽ nấu và giao tận nơi 🛵💨\n👉 ${l}\n\nXem đánh giá của khách hàng 💬⭐ ${g}`,
};
/** Текст клиенту на языке последнего заказа (нет языка — ru); ссылка — сайт с ?lang=. */
export const againText = (lang?: string | null) => AGAIN_TXT[lk(lang)](`${SITE_URL}/?lang=${linkLang(lang)}`, REVIEWS_URL);
/** Повторное сообщение: первая строка — только ник, пустая строка, текст клиенту на его языке. */
export const followupMessage = (f: Followup) =>
  `${esc(nickText(f.nick))}\n\n${esc(againText(f.lang))}`;
