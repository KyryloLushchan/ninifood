// Маршрут дня в группе курьера («NiniFood Courier», секрет COURIER_CHAT_ID): заголовки рейсов со ссылками и каждая точка — отдельным сообщением с кнопкой «✅ Доставлено».
// Тот же план, что у ночного отчёта (`planDay` по данным `day-plan.ts`). Кнопка курьера пишет только отметку (order_days.courier_marked_at) — статус заказа меняет админ.
// Сообщения без цен и сумм заказа; «Взять наличными» — сумма к получению у курьера. Язык русский.
import { nowDanang } from './dates.ts';
import { cashDue, handle, hrefAmp, kmText, mergeSameClient, portions, tripLinks, type ReportDelivery } from './courier-report.ts';
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
}
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
}

const norm = (d: ReportDelivery): ReportDelivery => ({ ...d, status: d.status === 'new' ? 'new' : 'confirmed' }); // «доставлено» — состояние кнопки курьера/админа, в тексте не участвует

/** Текст одной точки (без номера и времени — они добавляются отдельно). */
function stopBody(d: ReportDelivery): { head: string; body: string } {
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
  lines.push(`🍽 ${portions(d.qty)}${d.cutlery ? ' · 🍴 приборы: да' : ''}`);
  lines.push(due ? `💵 Взять наличными: <b>${money(due)}</b>` : '✅ Оплачено');
  return { head: `${esc(handle(d.telegram))} · ${esc(d.order_number)}`, body: lines.join('\n') };
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
          stops.push({ key: dayIds.join(','), body: sb.body + '|' + sb.head, head: sb.head, eta: ts.arriveMin, dayIds, label, title: fullText(label, sb, ts.arriveMin) });
        });
      });
      const prefix = plan.couriers.length > 1 ? `🛵 Курьер ${ci + 1} · ` : '';
      trips.push({
        no: tripNo,
        text: `${prefix}🚚 <b>Рейс ${ti + 1}</b> — ${t.portions} порц. · ${kmText(t.km)} · ${hhmm(t.startMin)}–${hhmm(t.endMin)}${t.overCapacity ? ' 🔴 больше вместимости' : ''}\n${tripLinks(t)}`,
        stops,
      });
    });
  });
  const noPoint: StopMsg[] = mergeSameClient(plan.noPoint.map(norm)).map((d) => {
    const sb = stopBody(d);
    const dayIds = [...(d.dayIds ?? [])].sort((a, b) => a - b);
    return { key: dayIds.join(','), body: sb.body + '|' + sb.head, head: sb.head, eta: 0, dayIds, label: '⚠️', title: `⚠️ <b>Без точки на карте</b> · ${sb.head}\n${sb.body}` };
  });
  const stopsTotal = trips.reduce((n, t) => n + t.stops.length, 0);
  const header = `🚚 <b>Маршрут на ${labelRu(date)}</b> — рейсов: ${trips.length} · адресов: ${stopsTotal + noPoint.length} · порций: ${[...trips.flatMap((t) => t.stops), ...noPoint].reduce((n, s) => n + (Number(/🍽 (\d+)/.exec(s.body)?.[1]) || 0), 0)}${warnings.length ? `\n${warnings.join('\n')}` : ''}`;
  return { header, trips, noPoint };
}

const keyboardDone = (id: number) => ({ inline_keyboard: [[{ text: '✅ Доставлено', callback_data: `d:${id}` }]] });
const keyboardUndo = (id: number) => ({ inline_keyboard: [[{ text: '↩️ Отменить', callback_data: `u:${id}` }]] });
const doneText = (title: string, at: string) => `${title.split('\n')[0]}\n✅ Доставлено курьером · ${at}`;

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
}

const plainDelivery = async (db: any, date: string) => {
  const day = await loadDayRows(db, date);
  if (day.error) throw new Error(day.error);
  const p = await loadDayPlan(db, date, day.rows);
  if (!p.kitchen) return null;
  const plan = planDay(p.deliveries, { lat: (d) => d.lat, lng: (d) => d.lng, address: (d) => d.address, qty: (d) => d.qty }, p.kitchen, p.couriers, p.trip, p.override);
  return buildRoutePlan(date, plan, p.couriers);
};

async function insertRow(db: any, v: Record<string, unknown>): Promise<number> {
  const { data, error } = await db.from('courier_route_msgs').insert(v).select('id').single();
  if (error) throw new Error(error.message);
  return Number(data.id);
}

async function post(db: any, chat: string, date: string, kind: Row['kind'], text: string, extra: { trip_no?: number; label?: string; sig?: string; day_ids?: number[] }, withButton: boolean): Promise<boolean> {
  const id = await insertRow(db, { date, kind, trip_no: extra.trip_no ?? null, label: extra.label ?? null, sig: extra.sig ?? null, text, day_ids: extra.day_ids ?? [], status: 'active', chat_id: Number(chat) });
  const r = await send(chat, 'sendMessage', { text, parse_mode: 'HTML', disable_web_page_preview: true, ...(withButton ? { reply_markup: keyboardDone(id) } : {}) });
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
  const { data: existing } = await db.from('courier_route_msgs').select('*').eq('date', date).eq('status', 'active');
  if ((existing ?? []).length && mode === 'publish') return { ok: true, skipped: 'already_published' };
  const rp = await plainDelivery(db, date);
  if (!rp) return { ok: false, code: 'kitchen_missing' };
  const total = 1 + rp.trips.reduce((n, t) => n + 1 + t.stops.length, 0) + rp.noPoint.length;
  if (!total) return { ok: true, skipped: 'empty' };

  const run = async () => {
    for (const row of (existing ?? []) as Row[]) await markObsolete(db, chat, row, '❌ Неактуально — маршрут отправлен заново');
    let failed = 0;
    if (!(await post(db, chat, date, 'day', rp.header, {}, false))) failed++;
    for (const t of rp.trips) {
      if (!(await post(db, chat, date, 'trip', t.text, { trip_no: t.no }, false))) failed++;
      for (const s of t.stops) if (!(await post(db, chat, date, 'stop', s.title, { trip_no: t.no, label: s.label, sig: s.body, day_ids: s.dayIds }, true))) failed++;
    }
    for (const s of rp.noPoint) if (!(await post(db, chat, date, 'stop', s.title, { label: s.label, sig: s.body, day_ids: s.dayIds }, true))) failed++;
    if (failed) await warn?.(`Маршрут ${esc(date)} в группу курьера отправлен не полностью: не ушло сообщений — ${failed}.`);
  };
  // Сообщений десятки, пауза между ними ~1 с: отправляем в фоне, чтобы ответ функции не ждал (в тестах — синхронно).
  const rt = (globalThis as any).EdgeRuntime;
  if (rt?.waitUntil) rt.waitUntil(run());
  else await run();
  return { ok: true, messages: total };
}

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
  const { data } = await db.from('courier_route_msgs').select('*').eq('date', date).eq('status', 'active').order('id');
  const rows = (data ?? []) as Row[];
  if (!rows.length) return { ok: true, skipped: 'not_published' };
  const rp = await plainDelivery(db, date);
  if (!rp) return { ok: true, skipped: 'kitchen_missing' };

  const oldStops = rows.filter((r) => r.kind === 'stop');
  const desired = [...rp.trips.flatMap((t) => t.stops.map((s) => ({ s, trip: t.no }))), ...rp.noPoint.map((s) => ({ s, trip: 0 }))];
  const byKey = new Map(oldStops.map((r) => [r.day_ids.join(','), r]));
  const keep = new Set<number>();
  const fresh: { s: StopMsg; trip: number }[] = [];
  const quiet: { row: Row; s: StopMsg }[] = [];
  for (const d of desired) {
    const row = byKey.get(d.s.key);
    if (row && row.sig === d.s.body) {
      keep.add(row.id);
      if (row.text !== d.s.title && !row.marked_at) quiet.push({ row, s: d.s });
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
    if (!row.message_id) continue;
    const r = await send(chat, 'editMessageText', { message_id: row.message_id, text: s.title, parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: keyboardDone(row.id) });
    if (r.ok || /not modified/i.test(r.description ?? '')) await db.from('courier_route_msgs').update({ text: s.title, label: s.label }).eq('id', row.id);
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
    for (const f of news) await post(db, chat, date, 'stop', f.s.title, { trip_no: t.no, label: f.s.label, sig: f.s.body, day_ids: f.s.dayIds }, true);
  }
  for (const f of fresh.filter((x) => x.trip === 0)) await post(db, chat, date, 'stop', f.s.title, { label: f.s.label, sig: f.s.body, day_ids: f.s.dayIds }, true);
  return { ok: true, changed: true };
}

/** Кнопка курьера: d — «✅ Доставлено» (пишет только отметку курьера), u — «↩️ Отменить». Права проверяет вызывающий. */
export async function courierButton(db: any, action: 'd' | 'u', rowId: number, by: string): Promise<{ ok: boolean; text?: string; edit?: { chat_id: number; message_id: number; text: string; reply_markup: unknown } }> {
  const { data: row } = await db.from('courier_route_msgs').select('*').eq('id', rowId).maybeSingle();
  if (!row || row.kind !== 'stop') return { ok: false, text: 'Сообщение не найдено' };
  if (row.status !== 'active') return { ok: false, text: 'Точка неактуальна' };
  const at = nowHM();
  if (action === 'd') {
    if ((row.day_ids as number[]).length) await db.from('order_days').update({ courier_marked_at: new Date().toISOString(), courier_marked_by: by }).in('id', row.day_ids).eq('delivered', false);
    await db.from('courier_route_msgs').update({ marked_at: new Date().toISOString(), marked_by: by }).eq('id', rowId);
    return { ok: true, edit: { chat_id: row.chat_id, message_id: row.message_id, text: doneText(row.text, at), reply_markup: keyboardUndo(rowId) } };
  }
  if ((row.day_ids as number[]).length) await db.from('order_days').update({ courier_marked_at: null, courier_marked_by: null }).in('id', row.day_ids).eq('delivered', false);
  await db.from('courier_route_msgs').update({ marked_at: null, marked_by: null }).eq('id', rowId);
  return { ok: true, edit: { chat_id: row.chat_id, message_id: row.message_id, text: row.text, reply_markup: keyboardDone(rowId) } };
}
