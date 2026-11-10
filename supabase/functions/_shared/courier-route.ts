// Маршрут дня в группе курьера («NiniFood Courier», секрет COURIER_CHAT_ID): заголовки рейсов со ссылками и каждая точка — отдельным сообщением с кнопкой «✅ Доставлено».
// Тот же план, что у ночного отчёта (`planDay` по данным `day-plan.ts`). Кнопка курьера пишет только отметку (order_days.courier_marked_at) — статус заказа меняет админ.
// Сообщения без цен и сумм заказа; «Взять наличными» — сумма к получению у курьера. Язык русский.
import { nowDanang, todayISO as todayISOLocal } from './dates.ts';
import { cashDue, handle, hrefAmp, kmText, mergeSameClient, taxiLine, paidLine, portions, tripLinks, type ReportDelivery } from './courier-report.ts';
import { loadDayPlan, loadDayRows } from './day-plan.ts';
import { mapUrl, money, phoneText } from './order-text.ts';
import { labelRu } from './dates.ts';
import { hhmm, lateWarning, planDay, type DayPlan } from './trips.ts';
import { esc, tg } from './telegram.ts';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Время Дананга «ЧЧ:ММ». */
export const nowHM = () => nowDanang().slice(-5);

export interface StopMsg {
  /** Сортированные id order_days точки (ключ сообщения) и тело без номера и времени (по нему видим, что точка изменилась). */
  key: string;
  body: string;
  head: string;
  eta: number;
  dayIds: number[];
  label: string;
  title: string;
  /** Язык заказа и ник клиента в Telegram (null — ника нет: кнопки сообщений клиенту не показываем). */
  lang: string;
  nick: string | null;
  /** «Такси»: без кнопок курьера (он эту доставку не везёт). */
  plain?: boolean;
}
/** Метка сообщения «Такси» в courier_route_msgs.label. */
export const TAXI_LABEL = '🚕';
export interface TripMsg {
  no: number;
  text: string;
  stops: StopMsg[];
}
export interface RoutePlan {
  header: string;
  trips: TripMsg[];
  /** Доставки без координат — в маршрут не входят, но курьеру показываются. */
  noPoint: StopMsg[];
  /** Заказы с флагом «Такси» — отдельные сообщения без кнопок в конце. */
  taxi: StopMsg[];
}

/** Telegram-ник клиента (без @ и t.me/); null — это не ник (телефон, пусто и т.п.). */
export function nickOf(raw: string): string | null {
  const h = raw.trim().replace(/^https?:\/\/(www\.)?t\.me\//i, '').replace(/^t\.me\//i, '').replace(/^@/, '');
  return /^[A-Za-z0-9_]{4,32}$/.test(h) ? h : null;
}
type L = 'ru' | 'ua' | 'en' | 'vi';
const ln = (l?: string | null): L => (l === 'ua' || l === 'en' || l === 'vi' ? l : 'ru');
/**
 * Тексты клиенту (на языке заказа, нет языка — RU): «Через сколько буду» — шаблон с пустым местом для минут (курьер вписывает сам, пять пробелов «через     мин»);
 * «Заказ прибыл» — всегда полный текст с приветствием.
 */
const ETA_TXT: Record<L, string> = {
  ru: 'Добрый день! 👋 Курьер NiniFood будет у вас через     мин 🛵💨',
  ua: "Добрий день! 👋 Кур'єр NiniFood буде у вас через     хв 🛵💨",
  en: 'Good afternoon! 👋 Your NiniFood courier will be there in     min 🛵💨',
  vi: 'Xin chào! 👋 Shipper NiniFood sẽ đến trong     phút nữa 🛵💨',
};
const ARRIVED_FULL: Record<L, string> = {
  ru: 'Добрый день! 👋 Ваш заказ прибыл 🛵🍲 NiniFood желает вам приятного аппетита! 😋💛',
  ua: 'Добрий день! 👋 Ваше замовлення прибуло 🛵🍲 NiniFood бажає вам смачного! 😋💛',
  en: 'Good afternoon! 👋 Your order has arrived 🛵🍲 NiniFood wishes you a delicious meal! 😋💛',
  vi: 'Xin chào! 👋 Đơn hàng của bạn đã đến 🛵🍲 NiniFood chúc bạn ngon miệng! 😋💛',
};
export const etaText = (lang: string | null | undefined) => ETA_TXT[ln(lang)];
export const arrivedText = (lang: string | null | undefined) => ARRIVED_FULL[ln(lang)];
/** Ссылка в личный чат с клиентом с готовым текстом в поле ввода (документированный формат t.me/<username>?text=…). */
export const chatUrl = (nick: string, text: string) => `https://t.me/${nick}?text=${encodeURIComponent(text)}`;

const norm = (d: ReportDelivery): ReportDelivery => ({ ...d, status: d.status === 'new' ? 'new' : 'confirmed' }); // «доставлено» — состояние кнопки курьера/админа, в тексте не участвует

/** Текст одной точки (без номера и времени — они добавляются отдельно). */
/** body — полный текст точки; sigBody — тот же без строки оплаты (её смена при «Доставлено» не считается изменением точки, текст правится тихо). */
function stopBody(d: ReportDelivery): { head: string; body: string; sigBody: string } {
  const due = cashDue(d);
  const addr = esc(d.address);
  const url = mapUrl(d.lat, d.lng, d.place_id);
  const lines: string[] = [];
  if (d.status === 'new') lines.push('⏳ <b>Не подтверждён</b>');
  lines.push(`📍 ${url ? `<a href="${hrefAmp(url)}">${addr}</a>` : addr}`);
  const comment = d.comment && !/^[\s\-–—.]*$/.test(d.comment) ? d.comment : null; // «-» и пустые комментарии не показываем
  const extra = [d.hotel ? `🏨 ${esc(d.hotel)}` : '', comment ? `💬 ${esc(comment.length > 300 ? `${comment.slice(0, 297)}…` : comment)}` : ''].filter(Boolean);
  if (extra.length) lines.push(extra.join(' · '));
  if (d.phone) lines.push(`📞 ${esc(phoneText(d.phone))}`);
  if (!nickOf(d.telegram)) lines.push('⚠️ нет Telegram — позвонить');
  lines.push(`🍽 ${portions(d.qty)}${d.cutlery ? ' · 🍴 приборы: да' : ''}`);
  const sigBody = lines.join('\n');
  lines.push(paidLine(d, due, money));
  return { head: `${esc(handle(d.telegram))} · ${esc(d.order_number)}`, body: lines.join('\n'), sigBody };
}

const fullText = (label: string, s: { head: string; body: string }, eta: number | null) => `<b>${label}.</b> ${s.head}\n${s.body}${eta != null ? `\n🕒 ≈ ${hhmm(eta)}` : ''}`;

/** Весь маршрут дня в виде набора сообщений. null — нет координат кухни. */
export function buildRoutePlan(date: string, plan: DayPlan<ReportDelivery>, couriers: 1 | 2): RoutePlan {
  const trips: TripMsg[] = [];
  const warnings: string[] = [];
  let tripNo = 0;
  let stopNo = 0;
  plan.couriers.forEach((cr, ci) => {
    const w = lateWarning(cr, couriers, ci);
    if (w) warnings.push(w);
    cr.trips.forEach((t, ti) => {
      tripNo++;
      const stops: StopMsg[] = [];
      t.stops.forEach((ts) => {
        stopNo++;
        const list = mergeSameClient(ts.stop.items.map(norm));
        list.forEach((d, k) => {
          const label = list.length > 1 ? `${stopNo}.${k + 1}` : String(stopNo);
          const sb = stopBody(d);
          const dayIds = [...(d.dayIds ?? [])].sort((a, b) => a - b);
          stops.push({ key: dayIds.join(','), body: sb.sigBody + '|' + sb.head, head: sb.head, eta: ts.arriveMin, dayIds, label, title: fullText(label, sb, ts.arriveMin), lang: ln(d.lang), nick: nickOf(d.telegram) });
        });
      });
      const prefix = plan.couriers.length > 1 ? `🛵 Курьер ${ci + 1} · ` : '';
      trips.push({
        no: tripNo,
        text: `${prefix}🚚 <b>Рейс ${ti + 1}</b> — ${t.portions} порц. · ${kmText(t.km)} · ${hhmm(t.startMin)}–${hhmm(t.endMin)}${t.overCapacity ? ' 🔴 больше вместимости' : ''}${t.box ? (t.box === 'box' ? ' · 📦 с ящиком' : ' · 🎒 без ящика') : ''}\n${tripLinks(t)}`,
        stops,
      });
    });
  });
  const noPoint: StopMsg[] = mergeSameClient(plan.noPoint.map(norm)).map((d) => {
    const sb = stopBody(d);
    const dayIds = [...(d.dayIds ?? [])].sort((a, b) => a - b);
    return { key: dayIds.join(','), body: sb.sigBody + '|' + sb.head, head: sb.head, eta: 0, dayIds, label: '⚠️', title: `⚠️ <b>Без точки на карте</b> · ${sb.head}\n${sb.body}`, lang: ln(d.lang), nick: nickOf(d.telegram) };
  });
  const taxi: StopMsg[] = mergeSameClient(plan.taxi.map(norm)).map((d) => {
    const line = taxiLine(d);
    const dayIds = [...(d.dayIds ?? [])].sort((a, b) => a - b);
    const head = `${esc(handle(d.telegram))} · ${esc(d.order_number)}`;
    // подпись такси — с нейтральной оплатой: «Доставлено»/получение наличных точку не меняют
    return { key: dayIds.join(','), body: taxiLine({ ...d, cashPending: false, cashOverride: undefined, cashSince: null }), head, eta: 0, dayIds, label: TAXI_LABEL, title: line, lang: ln(d.lang), nick: nickOf(d.telegram), plain: true };
  });
  const stopsTotal = trips.reduce((n, t) => n + t.stops.length, 0);
  const header = `🚚 <b>Маршрут на ${labelRu(date)}</b> — рейсов: ${trips.length} · адресов: ${stopsTotal + noPoint.length} · порций: ${[...trips.flatMap((t) => t.stops), ...noPoint].reduce((n, s) => n + (Number(/🍽 (\d+)/.exec(s.body)?.[1]) || 0), 0)}${warnings.length ? `\n${warnings.join('\n')}` : ''}`;
  return { header, trips, noPoint, taxi };
}

const doneText = (title: string, at: string) => `${title.split('\n')[0]}\n✅ Доставлено курьером · ${at}`;

/** Режим кнопок «клиенту»: url — открывает чат клиента с готовым текстом; copy — запасной (если Telegram не принял URL-кнопку): текст приходит ответом, его копируют. */
type KMode = 'url' | 'copy';
type KRow = Pick<Row, 'id' | 'nick' | 'lang' | 'marked_at'>;

/**
 * Кнопки точки: [✅ Доставлено][💬 Заказ прибыл] / [⏱ Через сколько буду] / [📝 Комментарий]. «💬» и «⏱» — URL-кнопки в чат клиента с готовым текстом (минуты курьер вписывает сам).
 * Нет ника — только «Доставлено» и «Комментарий». Отмеченная — «↩️ Отменить» и «Комментарий».
 */
export function rowKeyboard(r: KRow, mode: KMode = 'url') {
  const noteRow = [{ text: '📝 Комментарий', callback_data: `n:${r.id}` }]; // видна всем, работает только у id из списков доступа
  if (r.marked_at) return { inline_keyboard: [[{ text: '↩️ Отменить', callback_data: `u:${r.id}` }], noteRow] };
  const first: any[] = [{ text: '✅ Доставлено', callback_data: `d:${r.id}` }];
  const rows: any[][] = [first];
  if (r.nick) {
    first.push(mode === 'url' ? { text: '💬 Заказ прибыл', url: chatUrl(r.nick, arrivedText(r.lang)) } : { text: '💬 Заказ прибыл', callback_data: `a:${r.id}` });
    rows.push([mode === 'url' ? { text: '⏱ Через сколько буду', url: chatUrl(r.nick, etaText(r.lang)) } : { text: '⏱ Через сколько буду', callback_data: `s:${r.id}` }]);
  }
  rows.push(noteRow);
  return { inline_keyboard: rows };
}
/** Текст сообщения точки: основной + строка комментария админа (если есть). */
export const renderText = (r: { text: string; note?: string | null }) => `${r.text}${r.note ? `\n📝 Комментарий: ${esc(r.note)}` : ''}`;

/** Отправка с паузой между сообщениями и повтором при лимите Telegram (группа — не больше ~20 сообщений в минуту). */
async function send(chat: string, method: string, body: Record<string, unknown>): Promise<any> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const r: any = await tg(method, { chat_id: chat, ...body });
    if (r.ok) return r;
    const wait = Number(r.parameters?.retry_after ?? (/retry after (\d+)/i.exec(r.description ?? '')?.[1] ?? 0));
    if (!wait) return r;
    await sleep((wait + 1) * 1000);
  }
  return { ok: false, description: 'rate limit' };
}
const pace = () => Number(Deno.env.get('ROUTE_PACE_MS') ?? 1100);

interface Row {
  id: number;
  kind: 'day' | 'trip' | 'stop';
  trip_no: number | null;
  label: string | null;
  sig: string | null;
  text: string;
  day_ids: number[];
  message_id: number | null;
  status: 'active' | 'obsolete';
  marked_at: string | null;
  lang: string | null;
  nick: string | null;
  chat_id: number;
  note: string | null;
  note_prompt_id: number | null;
  note_prompt_by: number | null;
  is_test?: boolean;
  extra_msg_ids?: number[];
}

const plainDelivery = async (db: any, date: string) => {
  const day = await loadDayRows(db, date);
  if (day.error) throw new Error(day.error);
  const p = await loadDayPlan(db, date, day.rows);
  if (!p.kitchen) return null;
  const plan = planDay(p.deliveries, { lat: (d) => d.lat, lng: (d) => d.lng, address: (d) => d.address, qty: (d) => d.qty, taxi: (d) => d.taxi === true }, p.kitchen, p.couriers, p.trip, p.override);
  return buildRoutePlan(date, plan, p.couriers);
};

async function insertRow(db: any, v: Record<string, unknown>): Promise<number> {
  const { data, error } = await db.from('courier_route_msgs').insert(v).select('id').single();
  if (error) throw new Error(error.message);
  return Number(data.id);
}

async function post(db: any, chat: string, date: string, kind: Row['kind'], text: string, extra: { trip_no?: number; label?: string; sig?: string; day_ids?: number[]; lang?: string; nick?: string | null }, withButton: boolean): Promise<boolean> {
  // Комментарий админа к точке (order_days.courier_note) переживает перепубликацию и новые версии точки.
  let note: string | null = null;
  if (withButton && (extra.day_ids ?? []).length) {
    const { data: nd } = await db.from('order_days').select('courier_note').in('id', extra.day_ids);
    note = (nd ?? []).map((x: any) => x.courier_note).find(Boolean) ?? null;
  }
  const id = await insertRow(db, { date, kind, trip_no: extra.trip_no ?? null, label: extra.label ?? null, sig: extra.sig ?? null, text, day_ids: extra.day_ids ?? [], status: 'active', chat_id: Number(chat), lang: extra.lang ?? null, nick: extra.nick ?? null, note });
  const kb = (mode: KMode) => rowKeyboard({ id, nick: extra.nick ?? null, lang: extra.lang ?? null, marked_at: null }, mode);
  const shown = renderText({ text, note });
  let r = await send(chat, 'sendMessage', { text: shown, parse_mode: 'HTML', disable_web_page_preview: true, ...(withButton ? { reply_markup: kb('url') } : {}) });
  if (!r.ok && withButton && /BUTTON_URL_INVALID|URL_INVALID/i.test(r.description ?? '')) r = await send(chat, 'sendMessage', { text: shown, parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: kb('copy') });
  if (!r.ok) {
    console.error(`courier-route send failed (${kind} ${extra.label ?? ''}):`, r.description);
    await db.from('courier_route_msgs').update({ status: 'obsolete' }).eq('id', id);
    return false;
  }
  await db.from('courier_route_msgs').update({ message_id: r.result.message_id }).eq('id', id);
  await sleep(pace());
  return true;
}

const markObsolete = async (db: any, chat: string, row: Row, why = '❌ Неактуально') => {
  if (row.message_id) await send(chat, 'editMessageText', { message_id: row.message_id, text: `${why}\n<s>${row.text.replace(/<\/?(a|s)[^>]*>/g, '')}</s>`, parse_mode: 'HTML', reply_markup: { inline_keyboard: [] } });
  await db.from('courier_route_msgs').update({ status: 'obsolete' }).eq('id', row.id);
};

/** Удалить сообщение строки из группы (у бота право удалять) и вернуть её в обороте как неактуальную: message_id обнуляется, служебные сообщения точки (extra_msg_ids) тоже удаляются. */
async function deleteRowMessages(db: any, chat: string, row: Row): Promise<number> {
  const ids = [...new Set([row.message_id, row.note_prompt_id, ...(row.extra_msg_ids ?? [])].filter((x): x is number => !!x))];
  let n = 0;
  for (const id of ids) {
    const r: any = await send(chat, 'deleteMessage', { message_id: id });
    if (r.ok) n++;
    else if (!/message to delete not found|message can't be deleted/i.test(r.description ?? '')) console.error('deleteMessage failed:', r.description);
  }
  await db.from('courier_route_msgs').update({ status: 'obsolete', message_id: null, note_prompt_id: null, extra_msg_ids: [] }).eq('id', row.id);
  return n;
}

/** Удалить из группы все сообщения «❌ Неактуально» (строки status = obsolete) на даты; актуальные точки не трогаем. */
export async function purgeObsolete(db: any, dates: string[]): Promise<{ rows: number }> {
  const chat = Deno.env.get('COURIER_CHAT_ID') ?? '';
  if (!chat) return { rows: 0 };
  const { data } = await db.from('courier_route_msgs').select('*').in('date', dates).eq('status', 'obsolete').eq('is_test', false).order('id');
  const rows = ((data ?? []) as Row[]).filter((r) => r.message_id || r.note_prompt_id || (r.extra_msg_ids ?? []).length);
  const run = async () => {
    for (const r of rows) {
      await deleteRowMessages(db, chat, r);
      await sleep(Number(Deno.env.get('ROUTE_DELETE_PACE_MS') ?? 250));
    }
  };
  const rt = (globalThis as any).EdgeRuntime;
  if (rt?.waitUntil) rt.waitUntil(run());
  else await run();
  return { rows: rows.length };
}

const LOCK_KEY = 'courier_route_lock';
const LOCK_TTL_MS = 5 * 60_000;
/** Блокировка на время публикации: пока маршрут отправляется (старые сообщения гасятся, новые уходят), сверка (cron каждые 3 минуты) ничего не делает — иначе она дублирует точки. Истекает через 5 минут. */
async function setLock(db: any, on: boolean): Promise<void> {
  const value = on ? new Date().toISOString() : '';
  const { data } = await db.from('settings').select('key').eq('key', LOCK_KEY).maybeSingle();
  if (data) await db.from('settings').update({ value }).eq('key', LOCK_KEY);
  else await db.from('settings').insert({ key: LOCK_KEY, value, is_public: false });
}
async function locked(db: any): Promise<boolean> {
  const { data } = await db.from('settings').select('value').eq('key', LOCK_KEY).maybeSingle();
  const t = Date.parse(String(data?.value ?? ''));
  return Number.isFinite(t) && Date.now() - t < LOCK_TTL_MS;
}

export interface PublishResult {
  ok: boolean;
  code?: string;
  skipped?: string;
  messages?: number;
}

/** Публикация маршрута дня. mode 'publish' — если уже опубликован, ничего не делает; 'republish' — старые сообщения помечаются «❌ Неактуально» и маршрут отправляется заново. */
export async function publishRoute(db: any, date: string, mode: 'publish' | 'republish', warn?: (t: string) => Promise<void>): Promise<PublishResult> {
  const chat = Deno.env.get('COURIER_CHAT_ID') ?? '';
  if (!chat) {
    await warn?.('Маршрут не отправлен в группу курьера: не задан COURIER_CHAT_ID.');
    return { ok: false, code: 'chat_missing' };
  }
  const { data: existing } = await db.from('courier_route_msgs').select('*').eq('date', date).eq('status', 'active').eq('is_test', false);
  if ((existing ?? []).length && mode === 'publish') return { ok: true, skipped: 'already_published' };
  const rp = await plainDelivery(db, date);
  if (!rp) return { ok: false, code: 'kitchen_missing' };
  const total = 1 + rp.trips.reduce((n, t) => n + 1 + t.stops.length, 0) + rp.noPoint.length + rp.taxi.length;
  if (!total) return { ok: true, skipped: 'empty' };

  await setLock(db, true);
  const run = async () => {
   try {
    // при перепубликации старые сообщения маршрута удаляются из группы (не помечаются), чтобы группа оставалась чистой
    for (const row of (existing ?? []) as Row[]) await deleteRowMessages(db, chat, row);
    let failed = 0;
    // повторная отправка уже опубликованного маршрута — шапка «⚠️ Маршрут изменён» (старые сообщения выше помечены «❌ Неактуально»)
    const head = (existing ?? []).length ? `⚠️ <b>Маршрут изменён</b>\n${rp.header}` : rp.header;
    if (!(await post(db, chat, date, 'day', head, {}, false))) failed++;
    for (const t of rp.trips) {
      if (!(await post(db, chat, date, 'trip', t.text, { trip_no: t.no }, false))) failed++;
      for (const s of t.stops) if (!(await post(db, chat, date, 'stop', s.title, { trip_no: t.no, label: s.label, sig: s.body, day_ids: s.dayIds, lang: s.lang, nick: s.nick }, true))) failed++;
    }
    for (const s of rp.noPoint) if (!(await post(db, chat, date, 'stop', s.title, { label: s.label, sig: s.body, day_ids: s.dayIds, lang: s.lang, nick: s.nick }, true))) failed++;
    for (const s of rp.taxi) if (!(await post(db, chat, date, 'stop', s.title, { label: s.label, sig: s.body, day_ids: s.dayIds, lang: s.lang, nick: s.nick }, false))) failed++;
    if (failed) await warn?.(`Маршрут ${esc(date)} в группу курьера отправлен не полностью: не ушло сообщений — ${failed}.`);
   } finally {
    await setLock(db, false);
   }
  };
  // Сообщений десятки, пауза между ними ~1 с: отправляем в фоне, чтобы ответ функции не ждал (в тестах — синхронно).
  const rt = (globalThis as any).EdgeRuntime;
  if (rt?.waitUntil) rt.waitUntil(run());
  else await run();
  return { ok: true, messages: total };
}

/** Подпись точки без строки оплаты: у строк, опубликованных до этого правила, оплата ещё внутри sig — приводим к новому виду (иначе первая сверка назвала бы все точки изменёнными). */
export const canonSig = (sig: string | null): string | null =>
  sig == null
    ? sig
    : sig
        .replace(/\n(?:💵 Взять наличными[^|\n]*|✅ Оплачено)\|/, '|')
        .replace(/ · (?:💵 Взять наличными: <b>[^<]*<\/b>(?: \(не оплачено с [^)]*\))?|✅ Оплачено)(?= · 📞|$)/, ' · ✅ Оплачено');

export interface SyncResult {
  ok: boolean;
  changed?: boolean;
  skipped?: string;
}

/**
 * Сверка опубликованного маршрута с актуальным планом (правка адреса/порций, отмена, восстановление, подтверждение, ручное распределение).
 * Номера и время обновляются в сообщениях молча; если точки добавились/изменились/пропали — «⚠️ Маршрут изменён», новые версии изменённых точек, старые — «❌ Неактуально».
 */
export async function syncRoute(db: any, date: string): Promise<SyncResult> {
  const chat = Deno.env.get('COURIER_CHAT_ID') ?? '';
  if (!chat) return { ok: false, skipped: 'chat_missing' };
  if (await locked(db)) return { ok: true, skipped: 'publishing' };
  const { data } = await db.from('courier_route_msgs').select('*').eq('date', date).eq('status', 'active').eq('is_test', false).order('id');
  const rows = (data ?? []) as Row[];
  if (!rows.length) return { ok: true, skipped: 'not_published' };
  const rp = await plainDelivery(db, date);
  if (!rp) return { ok: true, skipped: 'kitchen_missing' };

  const oldStops = rows.filter((r) => r.kind === 'stop');
  const desired = [...rp.trips.flatMap((t) => t.stops.map((s) => ({ s, trip: t.no }))), ...rp.noPoint.map((s) => ({ s, trip: 0 })), ...rp.taxi.map((s) => ({ s, trip: 0 }))];
  const byKey = new Map(oldStops.map((r) => [r.day_ids.join(','), r]));
  const keep = new Set<number>();
  const fresh: { s: StopMsg; trip: number }[] = [];
  const quiet: { row: Row; s: StopMsg }[] = [];
  for (const d of desired) {
    const row = byKey.get(d.s.key);
    if (row && canonSig(row.sig) === d.s.body) {
      keep.add(row.id);
      if (row.text !== d.s.title || row.sig !== d.s.body) quiet.push({ row, s: d.s });
    } else fresh.push(d);
  }
  const gone = oldStops.filter((r) => !keep.has(r.id));

  // Заголовки рейсов и шапка: обновляем текст на месте (км/время могли измениться), без уведомления.
  const heads = rows.filter((r) => r.kind === 'trip' || r.kind === 'day');
  for (const h of heads) {
    const text = h.kind === 'day' ? rp.header : rp.trips.find((t) => t.no === h.trip_no)?.text;
    if (text && text !== h.text && h.message_id) {
      const r = await send(chat, 'editMessageText', { message_id: h.message_id, text, parse_mode: 'HTML', disable_web_page_preview: true });
      if (r.ok || /not modified/i.test(r.description ?? '')) await db.from('courier_route_msgs').update({ text }).eq('id', h.id);
    }
  }
  for (const { row, s } of quiet) {
    // Отмеченную курьером точку в группе не трогаем (там «сделано»), но текст и подпись в базе обновляем.
    if (!row.message_id || row.marked_at || row.text === s.title) {
      await db.from('courier_route_msgs').update({ text: s.title, label: s.label, sig: s.body }).eq('id', row.id);
      continue;
    }
    const r = await send(chat, 'editMessageText', { message_id: row.message_id, text: renderText({ ...row, text: s.title }), parse_mode: 'HTML', disable_web_page_preview: true, ...(s.plain ? {} : { reply_markup: rowKeyboard(row) }) });
    if (r.ok || /not modified/i.test(r.description ?? '')) await db.from('courier_route_msgs').update({ text: s.title, label: s.label, sig: s.body }).eq('id', row.id);
  }

  if (!fresh.length && !gone.length) {
    // Появился новый рейс без новых точек (деление изменилось) — шапка рейса.
    const have = new Set(heads.filter((h) => h.kind === 'trip').map((h) => h.trip_no));
    const missing = rp.trips.filter((t) => !have.has(t.no));
    for (const t of missing) await post(db, chat, date, 'trip', t.text, { trip_no: t.no }, false);
    return { ok: true, changed: false };
  }

  const lines = ['⚠️ <b>Маршрут изменён</b>'];
  for (const g of gone) lines.push(`➖ убрана/изменена: ${g.text.split('\n')[0].replace(/<[^>]+>/g, '')}`);
  for (const f of fresh) lines.push(`➕ ${f.s.label}. ${f.s.head}`);
  await post(db, chat, date, 'day', lines.join('\n'), {}, false);
  for (const g of gone) await markObsolete(db, chat, g);
  const haveTrips = new Set(heads.filter((h) => h.kind === 'trip').map((h) => h.trip_no));
  for (const t of rp.trips) {
    const news = fresh.filter((f) => f.trip === t.no);
    if (!news.length && haveTrips.has(t.no)) continue;
    if (!haveTrips.has(t.no)) await post(db, chat, date, 'trip', t.text, { trip_no: t.no }, false);
    for (const f of news) await post(db, chat, date, 'stop', f.s.title, { trip_no: t.no, label: f.s.label, sig: f.s.body, day_ids: f.s.dayIds, lang: f.s.lang, nick: f.s.nick }, true);
  }
  for (const f of fresh.filter((x) => x.trip === 0)) await post(db, chat, date, 'stop', f.s.title, { label: f.s.label, sig: f.s.body, day_ids: f.s.dayIds, lang: f.s.lang, nick: f.s.nick }, !f.s.plain);
  return { ok: true, changed: true };
}

export interface ButtonEdit {
  method: 'editMessageText' | 'editMessageReplyMarkup' | 'sendMessage';
  params: Record<string, unknown>;
}
export interface ButtonResult {
  ok: boolean;
  /** Всплывающий ответ на нажатие. */
  toast?: string;
  edits?: ButtonEdit[];
}

/**
 * Кнопки курьера в группе. d — «✅ Доставлено» (только отметка курьера), u — «↩️ Отменить»; a/s — запасной режим для «Заказ прибыл» / «Через сколько буду» (текст клиенту приходит ответом для копирования,
 * если Telegram не принял URL-кнопки). Права проверяет вызывающий.
 */
export async function courierButton(db: any, action: string, rowId: number, by: string, mode: KMode = 'url'): Promise<ButtonResult> {
  const { data: row } = await db.from('courier_route_msgs').select('*').eq('id', rowId).maybeSingle();
  if (!row || row.kind !== 'stop') return { ok: false, toast: 'Сообщение не найдено' };
  if (row.status !== 'active') return { ok: false, toast: 'Точка неактуальна' };
  const chat_id = row.chat_id;
  const message_id = row.message_id;
  const ids = row.day_ids as number[];
  const full = (r: Row, text: string, reply_markup: unknown): ButtonEdit => ({ method: 'editMessageText', params: { chat_id, message_id, text, reply_markup } });
  const at = nowHM();

  if (action === 'd') {
    if (ids.length) await db.from('order_days').update({ courier_marked_at: new Date().toISOString(), courier_marked_by: by }).in('id', ids).eq('delivered', false);
    const upd = { marked_at: new Date().toISOString(), marked_by: by };
    await db.from('courier_route_msgs').update(upd).eq('id', rowId);
    return { ok: true, toast: 'Отмечено ✅', edits: [full(row, doneText(renderText(row), at), rowKeyboard({ ...row, marked_at: upd.marked_at }, mode))] };
  }
  if (action === 'u') {
    if (ids.length) await db.from('order_days').update({ courier_marked_at: null, courier_marked_by: null }).in('id', ids).eq('delivered', false);
    await db.from('courier_route_msgs').update({ marked_at: null, marked_by: null }).eq('id', rowId);
    return { ok: true, toast: 'Отметка снята', edits: [full(row, renderText(row), rowKeyboard({ ...row, marked_at: null }, mode))] };
  }
  if (row.marked_at) return { ok: false, toast: 'Уже отмечено как доставлено' };
  if (!row.nick) return { ok: false, toast: 'Нет Telegram — позвонить клиенту' };
  if (action === 'a' || action === 's') {
    const text = action === 's' ? etaText(row.lang) : arrivedText(row.lang);
    return { ok: true, toast: 'Текст ниже — скопируйте и отправьте клиенту', edits: [{ method: 'sendMessage', params: { chat_id, text: `Клиенту @${esc(row.nick)}:\n<code>${esc(text)}</code>`, reply_to_message_id: message_id, allow_sending_without_reply: true } }] };
  }
  return { ok: false, toast: 'Некорректная кнопка' };
}

/** Перерисовать кнопки точки по текущему состоянию в БД (запасной режим copy, если Telegram не принял URL-кнопки). */
export async function courierResync(db: any, rowId: number, mode: KMode): Promise<ButtonEdit | null> {
  const { data: row } = await db.from('courier_route_msgs').select('*').eq('id', rowId).maybeSingle();
  if (!row?.message_id) return null;
  return { method: 'editMessageReplyMarkup', params: { chat_id: row.chat_id, message_id: row.message_id, reply_markup: rowKeyboard(row, mode) } };
}

/** Запомнить служебные сообщения точки (вопрос про комментарий, уведомления, ответы админа, копируемые тексты) — для тестовых точек их удаляют при очистке. */
export async function addExtra(db: any, rowId: number, ids: number[]): Promise<void> {
  const clean = ids.filter((x) => Number.isFinite(x));
  if (!clean.length) return;
  const { data } = await db.from('courier_route_msgs').select('extra_msg_ids').eq('id', rowId).maybeSingle();
  const cur: number[] = data?.extra_msg_ids ?? [];
  await db.from('courier_route_msgs').update({ extra_msg_ids: [...new Set([...cur, ...clean])] }).eq('id', rowId);
}

const orderNos = (text: string) => /NF-\d+(?: \+ NF-\d+)*/.exec(text.replace(/<[^>]+>/g, ''))?.[0] ?? 'заказу';

/** «📝 Комментарий» (только админы — проверяет вызывающий): бот просит написать комментарий ответом (ForceReply, адресно тому, кто нажал). */
export async function startNote(db: any, rowId: number, from: { id: number; first_name?: string; username?: string }): Promise<{ ok: boolean; toast?: string }> {
  const { data: row } = await db.from('courier_route_msgs').select('*').eq('id', rowId).maybeSingle();
  if (!row || row.kind !== 'stop' || row.status !== 'active') return { ok: false, toast: 'Точка неактуальна' };
  const chat = String(row.chat_id);
  if (row.note_prompt_id) await tg('deleteMessage', { chat_id: chat, message_id: row.note_prompt_id }); // прежний незавершённый вопрос убираем
  const name = esc(from.first_name || from.username || 'Админ');
  const r: any = await tg('sendMessage', {
    chat_id: chat,
    text: `<a href="tg://user?id=${from.id}">${name}</a>, напишите комментарий к <b>${esc(orderNos(row.text))}</b> ответом на это сообщение${row.note ? ' (заменит прежний; «-» — удалить)' : ' («-» — без комментария)'}.`,
    parse_mode: 'HTML',
    reply_to_message_id: row.message_id,
    allow_sending_without_reply: true,
    reply_markup: { force_reply: true, selective: true, input_field_placeholder: 'Комментарий для курьера' },
  });
  if (!r.ok) return { ok: false, toast: 'Не удалось отправить вопрос' };
  await db.from('courier_route_msgs').update({ note_prompt_id: r.result.message_id, note_prompt_by: from.id }).eq('id', rowId);
  await addExtra(db, rowId, [r.result.message_id]);
  return { ok: true, toast: '' };
}

/**
 * Ответ админа на вопрос бота: комментарий сохраняется (order_days.courier_note по всем дням точки + запись в order_edits), сообщение точки редактируется строкой «📝 Комментарий: …»,
 * курьеру — ответом «📝 Новый комментарий: …» (уведомление), служебные сообщения (вопрос и ответ) удаляются. «-» удаляет комментарий. true — сообщение обработано.
 */
export async function applyNote(db: any, msg: any): Promise<boolean> {
  const chatEnv = Deno.env.get('COURIER_CHAT_ID') ?? '';
  if (!chatEnv || String(msg.chat?.id) !== chatEnv || !msg.reply_to_message?.message_id) return false;
  const { data: row } = await db.from('courier_route_msgs').select('*').eq('note_prompt_id', msg.reply_to_message.message_id).maybeSingle();
  if (!row || row.status !== 'active') return false;
  const raw = typeof msg.text === 'string' ? msg.text.trim() : '';
  if (!raw) return false;
  const note: string | null = raw === '-' ? null : raw.slice(0, 500);
  const prevNote: string | null = row.note ?? null;
  const chat = String(row.chat_id);
  const ids: number[] = row.day_ids ?? [];

  if (ids.length) await db.from('order_days').update({ courier_note: note }).in('id', ids);
  await db.from('courier_route_msgs').update({ note, note_prompt_id: null, note_prompt_by: null }).eq('id', row.id);
  // журнал: запись в order_edits по каждому заказу точки
  const who = `${msg.from?.username ? `@${msg.from.username}` : msg.from?.id} (Telegram, группа курьера)`;
  if (ids.length) {
    const { data: days } = await db.from('order_days').select('id, order_id, delivery_date').in('id', ids);
    const orderIds = [...new Set((days ?? []).map((d: any) => d.order_id))];
    for (const oid of orderIds) {
      const { data: o } = await db.from('orders').select('total').eq('id', oid).maybeSingle();
      const { data: all } = await db.from('order_days').select('qty').eq('order_id', oid);
      const q = (all ?? []).reduce((n: number, x: any) => n + (Number(x.qty) || 0), 0);
      await db.from('order_edits').insert({ order_id: oid, created_by_email: who, old_total: o?.total ?? 0, new_total: o?.total ?? 0, old_portions: q, new_portions: q, kind: 'courier_note', changes: { note_from: prevNote, note_to: note, date: (days ?? []).find((d: any) => d.order_id === oid)?.delivery_date ?? null } });
    }
  }
  // сообщение точки: строка комментария (и прежние отметки/кнопки)
  const next = { ...row, note };
  const text = row.marked_at ? doneText(renderText(next), nowHM()) : renderText(next);
  const e = await tg('editMessageText', { chat_id: chat, message_id: row.message_id, text, parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: rowKeyboard(next) });
  if (!e.ok && /BUTTON_URL_INVALID|URL_INVALID/i.test(e.description ?? '')) await tg('editMessageText', { chat_id: chat, message_id: row.message_id, text, parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: rowKeyboard(next, 'copy') });
  // уведомление курьеру (ответ на сообщение точки)
  const notice: any = await tg('sendMessage', {
    chat_id: chat,
    text: note ? `📝 <b>Новый комментарий:</b> ${esc(note)}` : `📝 Комментарий к ${esc(orderNos(row.text))} удалён`,
    parse_mode: 'HTML',
    reply_to_message_id: row.message_id,
    allow_sending_without_reply: true,
  });
  await addExtra(db, row.id, [msg.message_id, notice?.result?.message_id]);
  // группа остаётся чистой: вопрос бота и ответ админа удаляются
  await tg('deleteMessage', { chat_id: chat, message_id: msg.reply_to_message.message_id });
  await tg('deleteMessage', { chat_id: chat, message_id: msg.message_id });
  return true;
}

/** ТЕСТ в самой группе: две выдуманные точки (получатель — тот, чей ник передан), без реальных заказов: day_ids пусты, is_test = true, сверка маршрута и отчёты их не видят. */
export async function sendTestPoints(db: any, nick: string): Promise<{ ids: number[] }> {
  const chat = Deno.env.get('COURIER_CHAT_ID') ?? '';
  if (!chat) throw new Error('chat_missing');
  const date = todayISOLocal();
  const ids: number[] = [];
  const insert = async (kind: Row['kind'], text: string, lang: string | null, withButtons: boolean, label: string | null) => {
    const row = await insertRow(db, { date, kind, label, text, day_ids: [], chat_id: Number(chat), status: 'active', lang, nick: withButtons ? nick : null, is_test: true });
    const r: any = await send(chat, 'sendMessage', { text, parse_mode: 'HTML', disable_web_page_preview: true, ...(withButtons ? { reply_markup: rowKeyboard({ id: row, nick, lang, marked_at: null }) } : {}) });
    if (!r.ok) throw new Error(`send failed: ${r.description}`);
    await db.from('courier_route_msgs').update({ message_id: r.result.message_id }).eq('id', row);
    ids.push(row);
    await sleep(pace());
    return row;
  };
  await insert('day', '🧪 <b>ТЕСТ кнопок маршрута</b> — выдуманные точки, реальные заказы, касса и отчёты не затрагиваются. Нажмите кнопки под точками.', null, false, null);
  const note = (extra: string) => `<b>🧪 ТЕСТ ${extra}</b>\n🧪 <i>выдуманные данные</i>`;
  await insert('stop', `${note('1.')} · @${nick} · NF-TEST1\n📍 Test Street 1, Đà Nẵng (тест)\n🏨 Test Hotel · 💬 тестовый комментарий клиента\n📞 +84 90 000 00 01\n🍽 2 порции · 🍴 приборы: да\n💵 Взять наличными: <b>190 000 ₫</b>\n🕒 ≈ 13:25`, 'ru', true, '1');
  await insert('stop', `${note('2.')} · @${nick} · NF-TEST2\n📍 Test Street 2, Đà Nẵng (тест)\n📞 +84 90 000 00 02\n🍽 1 порция\n✅ Оплачено\n🕒 ≈ 13:40`, 'vi', true, '2');
  return { ids };
}

/** Удалить тестовые сообщения из группы и тестовые записи (точки, их служебные сообщения, журнал нажатий). */
export async function cleanupTest(db: any): Promise<{ rows: number; messages: number; failed: number }> {
  const chat = Deno.env.get('COURIER_CHAT_ID') ?? '';
  const { data } = await db.from('courier_route_msgs').select('*').eq('is_test', true);
  const rows = (data ?? []) as Row[];
  let messages = 0;
  let failed = 0;
  for (const r of rows) {
    const ids = [...new Set([r.message_id, r.note_prompt_id, ...(r.extra_msg_ids ?? [])].filter((x): x is number => !!x))];
    for (const id of ids) {
      const res: any = await tg('deleteMessage', { chat_id: chat, message_id: id });
      if (res.ok) messages++;
      else if (!/message to delete not found/i.test(res.description ?? '')) failed++;
    }
    await db.from('courier_button_log').delete().eq('row_id', r.id);
    await db.from('courier_route_msgs').delete().eq('id', r.id);
  }
  return { rows: rows.length, messages, failed };
}

/** Перерисовать кнопки уже опубликованных точек на даты (после смены набора кнопок): editMessageReplyMarkup по каждой активной точке, без уведомлений. */
export async function refreshKeyboards(db: any, dates: string[]): Promise<{ rows: number }> {
  const chat = Deno.env.get('COURIER_CHAT_ID') ?? '';
  if (!chat) return { rows: 0 };
  const { data } = await db.from('courier_route_msgs').select('*').in('date', dates).eq('kind', 'stop').eq('status', 'active').eq('is_test', false).order('id');
  const rows = ((data ?? []) as Row[]).filter((r) => r.message_id && r.label !== TAXI_LABEL);
  const run = async () => {
    for (const r of rows) {
      let res = await send(chat, 'editMessageReplyMarkup', { message_id: r.message_id, reply_markup: rowKeyboard(r) });
      if (!res.ok && /BUTTON_URL_INVALID|URL_INVALID/i.test(res.description ?? '')) res = await send(chat, 'editMessageReplyMarkup', { message_id: r.message_id, reply_markup: rowKeyboard(r, 'copy') });
      if (!res.ok && !/not modified/i.test(res.description ?? '')) console.error('refresh keyboard failed:', res.description);
      await sleep(pace());
    }
  };
  const rt = (globalThis as any).EdgeRuntime;
  if (rt?.waitUntil) rt.waitUntil(run());
  else await run();
  return { rows: rows.length };
}
