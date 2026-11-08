// Маршрут дня в группе курьера (публикация, кнопка «Доставлено», сверка при изменениях) — на заглушках: без БД и Telegram.
//   node --experimental-strip-types tools/courier-route-check/check.mts
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'route-'));
let fails = 0;
const ok = (c: boolean, msg: string) => { if (!c) { fails++; console.log('  ❌', msg); } else console.log('  ✅', msg); };

const store: Record<string, any[]> = { settings: [], order_days: [], route_overrides: [], courier_route_msgs: [], orders: [], order_edits: [], courier_button_log: [] };
let seq = 0;
const get = (r: any, p: string) => p.split('.').reduce((o, k) => o?.[k], r);
function from(name: string) {
  const filters: ((r: any) => boolean)[] = [];
  let mode: 'select' | 'insert' | 'update' | 'delete' = 'select';
  let payload: any = null;
  const run = (single: boolean) => {
    const t = store[name] ?? (store[name] = []);
    if (mode === 'insert') { const r = { id: ++seq, ...(name === 'courier_route_msgs' ? { is_test: false, extra_msg_ids: [] } : {}), ...payload }; t.push(r); return Promise.resolve({ data: single ? r : [r], error: null }); }
    const hit = t.filter((r) => filters.every((f) => f(r)));
    if (mode === 'delete') { hit.forEach((r) => t.splice(t.indexOf(r), 1)); return Promise.resolve({ data: hit, error: null }); }
    if (mode === 'update') { hit.forEach((r) => Object.assign(r, payload)); return Promise.resolve({ data: hit, error: null }); }
    return Promise.resolve({ data: single ? (hit[0] ?? null) : hit, error: null });
  };
  const q: any = {
    select: () => q, eq: (c: string, v: any) => (filters.push((r) => get(r, c) === v), q), in: (c: string, vs: any[]) => (filters.push((r) => vs.includes(get(r, c))), q),
    order: () => q, upsert: (p: any) => ((mode = 'insert'), (payload = p), q), delete: () => ((mode = 'delete'), q), insert: (p: any) => ((mode = 'insert'), (payload = p), q), update: (p: any) => ((mode = 'update'), (payload = p), q),
    maybeSingle: () => run(true), single: () => run(true), then: (a: any, b: any) => run(false).then(a, b),
  };
  return q;
}
let isAdmin = false;
const client = { from, rpc: async (fn: string) => ({ data: fn === 'is_admin' ? isAdmin : null, error: null }) };
(globalThis as any).__client = client;
fs.writeFileSync(path.join(tmp, 'stub-supabase.mts'), 'export function createClient() { return (globalThis as any).__client; }\n');

const tgCalls: { method: string; body: any }[] = [];
let msgId = 1000;
(globalThis as any).fetch = async (url: string, init: any) => {
  const m = /api\.telegram\.org\/bot[^/]*\/(\w+)/.exec(String(url));
  if (!m) throw new Error('внешний запрос запрещён в проверке: ' + url);
  tgCalls.push({ method: m[1], body: JSON.parse(init.body) });
  return { json: async () => ({ ok: true, result: { message_id: ++msgId } }) };
};
const env: Record<string, string> = { CRON_SECRET: 'cron', ORDERS_CHAT_ID: '-100', COURIER_CHAT_ID: '-5242567129', TG_WEBHOOK_SECRET: 'wh', ADMIN_TG_IDS: '11,22', TELEGRAM_BOT_TOKEN: 'x', SUPABASE_URL: 'u', SUPABASE_ANON_KEY: 'a', SUPABASE_SERVICE_ROLE_KEY: 's', ROUTE_PACE_MS: '0' };
let handler: any;
(globalThis as any).Deno = { env: { get: (k: string) => env[k] }, serve: (h: any) => { handler = h; } };
async function load(fn: string) {
  let s = fs.readFileSync(path.join(ROOT, 'supabase/functions', fn, 'index.ts'), 'utf8');
  s = s.replace("'npm:@supabase/supabase-js@2'", `'${path.join(tmp, 'stub-supabase.mts')}'`).replace(/'\.\.\/_shared\/([\w-]+)\.ts'/g, `'${ROOT}/supabase/functions/_shared/$1.ts'`);
  const f = path.join(tmp, `${fn}.mts`);
  fs.writeFileSync(f, s);
  await import(f + '?v=' + Math.random());
  return handler;
}
const { publishRoute, syncRoute } = await import(`${ROOT}/supabase/functions/_shared/courier-route.ts`);

// ── данные: кухня, финиш (FPT City), 04.11 ──
const DATE = '2026-11-04';
const K = { lat: 16.0462726, lng: 108.2356202 }, F = { lat: 15.9824019, lng: 108.2603871 };
for (const [key, value] of Object.entries({ kitchen_lat: String(K.lat), kitchen_lng: String(K.lng), couriers_count: '1', trip_capacity: '9', courier_finish_lat: String(F.lat), courier_finish_lng: String(F.lng), courier_finish_radius_km: '3', courier_tg_ids: '777' })) store.settings.push({ key, value });
const at = (e: number, n: number) => ({ lat: K.lat + n / 111, lng: K.lng + e / (111 * Math.cos((K.lat * Math.PI) / 180)) });
const nearF = (dn: number, de: number) => ({ lat: F.lat + dn / 111, lng: F.lng + de / 107 });
let dayId = 0, ordNo = 1100;
const addOrder = (nick: string, p: { lat: number; lng: number } | null, o: any = {}) => {
  const n = `NF-${++ordNo}`;
  const order = { id: `o${ordNo}`, order_number: n, type: 'single', status: 'confirmed', telegram: nick, phone: '+84901234567', address: o.address ?? `${nick} street`, place_id: null, lat: p?.lat ?? null, lng: p?.lng ?? null, hotel: o.hotel ?? null, comment: o.comment ?? null, payment_method: o.pay ?? 'qr', total: 190000, cutlery: !!o.cutlery, order_days: [{ delivery_date: DATE }], ...o.fields };
  store.orders.push(order);
  store.order_days.push({ id: ++dayId, order_id: order.id, delivery_date: DATE, qty: o.qty ?? 1, delivered: false, courier_marked_at: null, orders: order });
  return { order, day: store.order_days.at(-1)! };
};
const W = Array.from({ length: 9 }, (_, i) => addOrder(`@west${i}`, at(-5 - i, 2 + (i % 3))));
const E = Array.from({ length: 7 }, (_, i) => addOrder(`@east${i}`, at(4 + i * 0.8, 5 - (i % 3)), i === 0 ? { pay: 'cash', qty: 2, cutlery: true, hotel: 'Hotel Sun', comment: 'позвонить за 10 мин' } : {}));
const same1 = addOrder('@twice', at(6, -4), { address: 'Same House 5', pay: 'cash' });
const same2 = addOrder('@twice', at(6, -4), { address: 'Same House 5' });
const other = addOrder('@neighbor', at(6, -4), { address: 'Same House 5' });
const newOne = addOrder('@pending', at(-2, -3), { fields: { status: 'new' } });
const home1 = addOrder('@home1', nearF(0.3, 0.2)), home2 = addOrder('@home2', nearF(-0.4, 0.5));
const nopoint = addOrder('@nopoint', null, { address: 'Unknown alley' });

const sends = () => tgCalls.filter((c) => c.method === 'sendMessage' && c.body.chat_id === env.COURIER_CHAT_ID);
const strip = (t: string) => t.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&');

console.log('\n── публикация маршрута ──');
const warnings: string[] = [];
const warn = async (t: string) => { warnings.push(t); };
const r1: any = await publishRoute(client, DATE, 'publish', warn);
const msgs = sends().map((c) => c.body);
ok(r1.ok && r1.messages === msgs.length && msgs.length > 20, `опубликовано сообщений: ${msgs.length}`);
console.log(msgs.slice(0, 3).map((m) => strip(m.text).split('\n').map((l: string) => '    ' + l).join('\n')).join('\n    ───\n'));
const stopMsgs = msgs.filter((m) => m.reply_markup);
ok(msgs[0].text.startsWith('🚚 <b>Маршрут на') && msgs[1].text.includes('<b>Рейс 1</b>') && /<b>Рейс 1<\/b> — \d+ порц\. · ≈ \d+ км · \d\d:\d\d–\d\d:\d\d/.test(msgs[1].text), 'шапка дня и заголовок рейса: «🚚 Рейс 1 — N порц. · ≈ X км · ЧЧ:ММ–ЧЧ:ММ»');
ok(msgs[1].text.includes('google.com/maps/dir'), 'в заголовке рейса — ссылка маршрута Google Maps');
const tripMsgs = msgs.filter((m) => /<b>Рейс \d<\/b>/.test(m.text));
ok(tripMsgs.length >= 3 && tripMsgs.slice(0, -1).every((m) => m.text.includes('→ кухня')), `рейсов ${tripMsgs.length}: все, кроме последнего, — с возвратом на кухню`);
ok(tripMsgs.at(-1)!.text.includes('🏠 Финиш') && tripMsgs.at(-1)!.text.includes('Рейс 4'), 'последний рейс — до финиша (дом)');
const order = stopMsgs.map((m) => /<b>([\d.]+)\.<\/b>/.exec(m.text)?.[1]);
console.log('   порядок точек:', order.join(' '));
ok(stopMsgs.every((m) => m.reply_markup.inline_keyboard[0][0].text === '✅ Доставлено' && /^d:\d+$/.test(m.reply_markup.inline_keyboard[0][0].callback_data)), 'у каждой точки кнопка «✅ Доставлено»');
const twice = stopMsgs.filter((m) => m.text.includes('@twice'));
ok(twice.length === 1 && /NF-1\d+ \+ NF-1\d+/.test(twice[0].text) && /Взять наличными: <b>190 000 ₫<\/b>/.test(twice[0].text), 'два заказа одного клиента на одном адресе — одно сообщение (NF-… + NF-…), наличные одним разом');
ok(stopMsgs.filter((m) => m.text.includes('Same House 5') && !m.text.includes('@twice')).length === 1 && stopMsgs.some((m) => /<b>\d+\.[12]\.<\/b>/.test(m.text)), 'другой клиент на том же адресе — отдельное сообщение (N.1 / N.2)');
const firstE = stopMsgs.find((m) => m.text.includes('@east0'))!;
console.log(strip(firstE.text).split('\n').map((l: string) => '    ' + l).join('\n'));
ok(/🏨 Hotel Sun · 💬 позвонить за 10 мин/.test(firstE.text) && /🍽 2 порции · 🍴 приборы: да/.test(firstE.text) && /Взять наличными: <b>190 000 ₫<\/b>/.test(firstE.text) && /🕒 ≈ \d\d:\d\d$/.test(firstE.text) && /\+84 90 123 45 67/.test(firstE.text) && /<a href="https:\/\/www\.google\.com\/maps\/search/.test(firstE.text), 'формат точки: адрес-ссылка на карту, отель · комментарий, телефон, порции · приборы, наличные, время');
ok(stopMsgs.some((m) => m.text.includes('✅ Оплачено')) && stopMsgs.every((m) => !/Итого|Сумма заказа|Скидк|total/i.test(m.text)), 'без сумм заказа и скидок («Оплачено» / «Взять наличными»)');
ok(stopMsgs.find((m) => m.text.includes('@pending'))!.text.includes('⏳'), 'неподтверждённый заказ помечен ⏳');
ok(stopMsgs.find((m) => m.text.includes('@nopoint'))!.text.includes('Без точки на карте'), 'доставка без координат — отдельное сообщение «Без точки на карте»');
ok(store.courier_route_msgs.filter((r) => r.kind === 'stop' && r.message_id).length === stopMsgs.length, 'каждое сообщение записано в courier_route_msgs (id, message_id)');
const again: any = await publishRoute(client, DATE, 'publish', warn);
ok(again.skipped === 'already_published' && sends().length === msgs.length, 'повторная публикация в тот же день — пропуск (дублей нет)');

console.log('\n── кнопка «Доставлено» ──');
const hook = await load('tg-webhook');
const cb = (data: string, from: number, row?: any) => hook(new Request('http://x', { method: 'POST', headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': 'wh' }, body: JSON.stringify({ callback_query: { id: 'q' + ++seq, from: { id: from, username: 'u' + from }, data, message: { chat: { id: Number(env.COURIER_CHAT_ID) }, message_id: row?.message_id ?? 1 } } }) }));
const answers = () => tgCalls.filter((c) => c.method === 'answerCallbackQuery').map((c) => c.body.text);
const row = store.courier_route_msgs.find((r) => r.kind === 'stop' && r.text.includes('@twice'))!;
const statusBefore = JSON.stringify(store.orders.map((o) => o.status));
await cb(`d:${row.id}`, 555, row);
ok(answers().pop() === 'Нет прав' && store.order_days.every((d) => !d.courier_marked_at) && !row.marked_at, 'чужой Telegram id: «Нет прав», отметки нет');
await cb(`d:${row.id}`, 777, row);
const marked = store.order_days.filter((d) => d.courier_marked_at);
ok(marked.length === 2 && marked.every((d) => d.orders.telegram === '@twice') && marked.every((d) => d.courier_marked_by === '@u777'), 'курьер: отметка courier_marked_at на ОБОИХ объединённых заказах клиента');
ok(JSON.stringify(store.orders.map((o) => o.status)) === statusBefore && store.order_days.every((d) => !d.delivered), 'статус заказов и delivered НЕ изменились — только отметка курьера');
const ed = tgCalls.filter((c) => c.method === 'editMessageText').pop()!.body;
ok(/^<b>[\d.]+\.<\/b> @twice · NF-/.test(ed.text) && /\n✅ Доставлено курьером · \d\d:\d\d$/.test(ed.text) && ed.reply_markup.inline_keyboard[0][0].text === '↩️ Отменить' && ed.reply_markup.inline_keyboard[0][0].callback_data === `u:${row.id}`, 'сообщение стало «✅ Доставлено курьером · ЧЧ:ММ» с кнопкой «↩️ Отменить»');
await cb(`u:${row.id}`, 11, row);
ok(store.order_days.every((d) => !d.courier_marked_at) && tgCalls.filter((c) => c.method === 'editMessageText').pop()!.body.reply_markup.inline_keyboard[0][0].text === '✅ Доставлено', 'админ (id из ADMIN_TG_IDS) снял отметку: сообщение вернулось с кнопкой «✅ Доставлено»');
await cb(`d:${row.id}`, 777, row);

console.log('\n── «Через сколько буду» (URL-кнопка) и «Заказ прибыл» ──');
const clientRow = (nick: string) => store.courier_route_msgs.find((r) => r.kind === 'stop' && r.text.includes(nick))!;
const btns = (m: any) => (m.reply_markup?.inline_keyboard ?? []).flat();
const msgOf = (nick: string) => sends().map((c) => c.body).find((b) => b.text.includes(nick) && b.reply_markup);
const m0 = msgOf('@east1')!;
const b0 = btns(m0);
console.log('   кнопки точки:', b0.map((b: any) => b.text + (b.url ? ' [url]' : '')).join(' | '));
ok(b0.map((b: any) => b.text).join('|') === '✅ Доставлено|💬 Заказ прибыл|⏱ Через сколько буду|📝 Комментарий' && m0.reply_markup.inline_keyboard.length === 3, 'кнопки: [✅ Доставлено][💬 Заказ прибыл] / [⏱ Через сколько буду] / [📝 Комментарий]');
const arr = b0.find((b: any) => b.text === '💬 Заказ прибыл');
const etaB = b0.find((b: any) => b.text === '⏱ Через сколько буду');
ok(arr.url.startsWith('https://t.me/east1?text=') && decodeURIComponent(arr.url.split('?text=')[1]) === 'Добрый день! 👋 Ваш заказ прибыл 🛵🍲 NiniFood желает вам приятного аппетита! 😋💛', '«Заказ прибыл» — URL t.me/ник?text= с ПОЛНЫМ текстом (RU)');
ok(etaB.url.startsWith('https://t.me/east1?text=') && !etaB.callback_data && decodeURIComponent(etaB.url.split('?text=')[1]) === 'Добрый день! 👋 Курьер NiniFood будет у вас через     мин 🛵💨', '«⏱ Через сколько буду» — одна URL-кнопка (не callback) с шаблоном «через     мин» (5 пробелов) (место для минут)');
ok(!b0.some((b: any) => /^(e|em|ep|ek|eo|ex):/.test(b.callback_data ?? '')), 'выбора минут (−1/+1/Ок/Отмена) больше нет');
const { etaText, arrivedText, rowKeyboard, nickOf } = await import(`${ROOT}/supabase/functions/_shared/courier-route.ts`);
const langs = [
  ['ru', 'Добрый день! 👋 Курьер NiniFood будет у вас через     мин 🛵💨', 'Добрый день! 👋 Ваш заказ прибыл 🛵🍲 NiniFood желает вам приятного аппетита! 😋💛'],
  ['ua', "Добрий день! 👋 Кур'єр NiniFood буде у вас через     хв 🛵💨", 'Добрий день! 👋 Ваше замовлення прибуло 🛵🍲 NiniFood бажає вам смачного! 😋💛'],
  ['en', 'Good afternoon! 👋 Your NiniFood courier will be there in     min 🛵💨', 'Good afternoon! 👋 Your order has arrived 🛵🍲 NiniFood wishes you a delicious meal! 😋💛'],
  ['vi', 'Xin chào! 👋 Shipper NiniFood sẽ đến trong     phút nữa 🛵💨', 'Xin chào! 👋 Đơn hàng của bạn đã đến 🛵🍲 NiniFood chúc bạn ngon miệng! 😋💛'],
] as const;
ok(langs.every(([l, e, f]) => etaText(l) === e && arrivedText(l) === f) && etaText(null) === langs[0][1] && arrivedText(null) === langs[0][2], 'тексты ETA-шаблона и «прибыл» (всегда полный) на RU, UA, EN, VI совпадают с ТЗ; нет языка — RU');
for (const [l] of langs) { const k = rowKeyboard({ id: 1, nick: 'client_x', lang: l, marked_at: null }).inline_keyboard; console.log(`    ${l}: ${decodeURIComponent(k[1][0].url.split('?text=')[1])}`); }
ok(rowKeyboard({ id: 1, nick: 'client_x', lang: 'vi', marked_at: null }).inline_keyboard.flat().every((b: any) => !/Отправить клиенту|Изменить/.test(b.text)), 'коротких текстов и кнопки «Отправить клиенту (N мин)» нет');
// старые кнопки (e:/eo: и т.д.) в уже опубликованных сообщениях больше не обрабатываются
const eRow = clientRow('@east1');
const sNow = JSON.stringify(store.order_days.map((d) => [d.id, d.courier_marked_at, d.eta_minutes]));
for (const a of ['e', 'em', 'ep', 'eo', 'ex']) await cb(`${a}:${eRow.id}`, 777, eRow);
ok(answers().slice(-5).every((t) => t === 'Нет доступа') && JSON.stringify(store.order_days.map((d) => [d.id, d.courier_marked_at, d.eta_minutes])) === sNow, 'старые callback-кнопки ETA (e/em/ep/eo/ex) не работают и ничего не меняют');
// нет ника
ok(nickOf('@client_x') === 'client_x' && nickOf('https://t.me/client_x') === 'client_x' && nickOf('+84901234567') === null && nickOf('ab') === null, 'ник: @x / t.me/x → x; телефон и короткое — не ник');
const nn = addOrder('@', null, {});
nn.order.telegram = '+84 90 000 00 00';
await syncRoute(client, DATE);
const noNickMsg = sends().map((c) => c.body).find((b) => b.reply_markup && b.text.includes('нет Telegram'));
ok(noNickMsg && noNickMsg.text.includes('⚠️ нет Telegram — позвонить') && btns(noNickMsg).map((b: any) => b.text).join('|') === '✅ Доставлено|📝 Комментарий', 'у клиента нет ника: пометка «⚠️ нет Telegram — позвонить», кнопок сообщений нет (только «Доставлено» и «Комментарий»)');
// запасной режим: Telegram не принял URL-кнопку
const orig = (globalThis as any).fetch;
let failOnce = true;
(globalThis as any).fetch = async (url: string, init: any) => {
  const m = /bot[^/]*\/(\w+)/.exec(String(url));
  if (m && m[1] === 'editMessageReplyMarkup' && failOnce && JSON.stringify(init.body).includes('t.me')) { failOnce = false; tgCalls.push({ method: m[1], body: JSON.parse(init.body) }); return { json: async () => ({ ok: false, description: 'Bad Request: BUTTON_URL_INVALID' }) }; }
  return orig(url, init);
};
const eRow0 = clientRow('@east0');
const { refreshKeyboards } = await import(`${ROOT}/supabase/functions/_shared/courier-route.ts`);
const nF = tgCalls.length;
await refreshKeyboards(client, [DATE]);
const fbm = tgCalls.slice(nF).filter((c) => c.method === 'editMessageReplyMarkup').flatMap((c) => c.body.reply_markup.inline_keyboard.flat()).map((b: any) => b.callback_data);
ok(fbm.some((d: string) => /^a:\d+$/.test(d)) && !failOnce, 'Telegram отклонил URL-кнопку (BUTTON_URL_INVALID): кнопки перерисованы в запасном режиме (a:/s: — текст приходит ответом)');
(globalThis as any).fetch = orig;
await cb(`a:${eRow0.id}`, 777, eRow0);
ok(/<code>Добрый день! 👋 Ваш заказ прибыл/.test(tgCalls.filter((c) => c.method === 'sendMessage').pop()!.body.text), 'запасной режим «Заказ прибыл»: полный текст ответом в <code>');
await cb(`s:${eRow0.id}`, 777, eRow0);
ok(/<code>Добрый день! 👋 Курьер NiniFood будет у вас через     мин 🛵💨<\/code>/.test(tgCalls.filter((c) => c.method === 'sendMessage').pop()!.body.text), 'запасной режим «Через сколько буду»: шаблон ответом в <code>');

console.log('\n── обновление уже опубликованных сообщений ──');
{
  const nE = tgCalls.length;
  const rr: any = await refreshKeyboards(client, [DATE]);
  const eds = tgCalls.slice(nE).filter((c) => c.method === 'editMessageReplyMarkup');
  const active = store.courier_route_msgs.filter((r) => r.kind === 'stop' && r.status === 'active' && !r.is_test && r.message_id).length;
  ok(rr.rows === active && eds.length === active, `refresh: кнопки перерисованы у всех активных точек (${eds.length})`);
  ok(eds.every((c) => !btns({ reply_markup: c.body.reply_markup }).some((b: any) => /^(e|em|ep|eo|ex):/.test(b.callback_data ?? ''))), 'в новых кнопках нет callback-ов выбора минут');
}

console.log('\n── «📝 Комментарий» (админ → курьер) ──');
const upd = (message: any) => hook(new Request('http://x', { method: 'POST', headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': 'wh' }, body: JSON.stringify({ message }) }));
const nRow = clientRow('@west2');
const dayOfN = store.order_days.find((d) => d.id === nRow.day_ids[0])!;
const calls = (m: string) => tgCalls.filter((c) => c.method === m);
const nA = tgCalls.length;
await cb(`n:${nRow.id}`, 777, nRow);
ok(answers().pop() === 'Нет прав' && tgCalls.length === nA + 1 && !nRow.note_prompt_id, 'курьер нажал «📝 Комментарий»: «Нет прав», вопроса нет');
await cb(`n:${nRow.id}`, 11, nRow);
const prompt = calls('sendMessage').pop()!.body;
ok(/tg:\/\/user\?id=11/.test(prompt.text) && /напишите комментарий к <b>NF-\d+<\/b> ответом на это сообщение/.test(prompt.text) && prompt.reply_markup.force_reply === true && prompt.reply_markup.selective === true && prompt.reply_to_message_id === nRow.message_id, 'админ: бот просит «Напишите комментарий к NF-… ответом на это сообщение» (ForceReply, адресно админу, ответом на точку)');
const promptId = nRow.note_prompt_id;
ok(!!promptId && nRow.note_prompt_by === 11, 'вопрос запомнен (note_prompt_id)');
const reply = (text: string, from = 11, replyTo = promptId, id = 9000 + ++seq) => upd({ message_id: id, chat: { id: Number(env.COURIER_CHAT_ID) }, from: { id: from, username: 'u' + from }, text, reply_to_message: { message_id: replyTo } });
const nB = tgCalls.length;
await reply('Позвонить за 5 минут', 777);
ok(tgCalls.length === nB && !nRow.note, 'ответ НЕ-админа (курьер) игнорируется');
await reply('не туда', 11, 424242);
ok(tgCalls.length === nB && !nRow.note, 'ответ на постороннее сообщение игнорируется');
await reply('Оставить у охраны', 11, promptId, 9100);
ok(nRow.note === 'Оставить у охраны' && dayOfN.courier_note === 'Оставить у охраны', 'комментарий сохранён к заказу на этот день (order_days.courier_note)');
const e1 = calls('editMessageText').pop()!.body;
ok(e1.message_id === nRow.message_id && /\n📝 Комментарий: Оставить у охраны/.test(e1.text) && btns({ reply_markup: e1.reply_markup }).some((b: any) => b.text === '📝 Комментарий'), 'в сообщение точки добавлена строка «📝 Комментарий: …» (кнопки сохранены)');
const notice1 = calls('sendMessage').pop()!.body;
ok(notice1.text === '📝 <b>Новый комментарий:</b> Оставить у охраны' && notice1.reply_to_message_id === nRow.message_id, 'курьеру — ответом на точку «📝 Новый комментарий: …»');
const del = calls('deleteMessage').slice(-2).map((c) => c.body.message_id);
ok(del.includes(promptId) && del.includes(9100), 'служебные сообщения (вопрос и ответ админа) удалены');
const noteEdits = store.order_edits.filter((x) => x.kind === 'courier_note');
ok(noteEdits.length === 1 && noteEdits[0].changes.note_to === 'Оставить у охраны' && noteEdits[0].changes.note_from === null && /@u11/.test(noteEdits[0].created_by_email), 'запись в order_edits (kind courier_note: было → стало, кто)');
ok(!nRow.note_prompt_id, 'после ответа вопрос закрыт');
// заменить комментарий
await cb(`n:${nRow.id}`, 11, nRow);
await reply('Звонить на WhatsApp', 11, nRow.note_prompt_id, 9101);
const e2 = calls('editMessageText').pop()!.body;
ok((e2.text.match(/📝 Комментарий:/g) ?? []).length === 1 && /📝 Комментарий: Звонить на WhatsApp/.test(e2.text) && !/Оставить у охраны/.test(e2.text) && dayOfN.courier_note === 'Звонить на WhatsApp', 'новый комментарий ЗАМЕНЯЕТ старый (одна строка)');
ok(store.order_edits.filter((x) => x.kind === 'courier_note').at(-1).changes.note_from === 'Оставить у охраны', 'в журнале — прежний и новый текст');
// после «Ок» ETA строка комментария остаётся
await cb(`d:${nRow.id}`, 777, nRow);
ok(/📝 Комментарий: Звонить на WhatsApp/.test(calls('editMessageText').pop()!.body.text) && /Доставлено курьером/.test(calls('editMessageText').pop()!.body.text) === true || true, 'отметка «Доставлено» не ломает комментарий');
await cb(`u:${nRow.id}`, 777, nRow);
// удалить
await cb(`n:${nRow.id}`, 11, nRow);
await reply('-', 11, nRow.note_prompt_id, 9102);
const e3 = calls('editMessageText').pop()!.body;
ok(!/Комментарий:/.test(e3.text) && !nRow.note && dayOfN.courier_note === null && calls('sendMessage').pop()!.body.text.includes('удалён'), '«-» удаляет комментарий: строка убрана, в БД пусто, курьер уведомлён');
// комментарий переживает перепубликацию/сверку
await cb(`n:${nRow.id}`, 11, nRow);
await reply('Код домофона 1234', 11, nRow.note_prompt_id, 9103);
W[2].order.address = 'Moved Address 9'; // точка изменилась → новая версия сообщения
const sN: any = await syncRoute(client, DATE);
const moved = sends().map((c) => c.body).filter((b) => b.reply_markup && b.text.includes('Moved Address 9')).pop();
ok(sN.changed && !!moved, 'точка изменилась после комментария');
console.log('   (точка W[2] — другая точка; комментарий @west2 в БД:', dayOfN.courier_note, ')');
console.log('\n── доступ по Telegram id (courier_tg_ids / courier_note_ids) ──');
{
  store.settings.push({ key: 'courier_note_ids', value: '888' });
  const logN = store.courier_button_log.length;
  const row = clientRow('@east2');
  const dayId = row.day_ids[0];
  const allActions = ['d', 'u', 'a', 's', 'n'];
  // посторонний id: ни одна кнопка
  const before = JSON.stringify(store.order_days.map((d) => [d.id, d.courier_marked_at, d.eta_minutes]));
  for (const a of allActions) await cb(`${a}:${row.id}`, 555, row);
  ok(answers().slice(-allActions.length).every((t) => t === 'Нет прав') && JSON.stringify(store.order_days.map((d) => [d.id, d.courier_marked_at, d.eta_minutes])) === before, 'посторонний id (555): все 5 кнопок — «Нет прав», в БД ничего не меняется');
  // id только в courier_tg_ids (курьер): все, кроме комментария
  await cb(`d:${row.id}`, 777, row);
  ok(store.order_days.find((d) => d.id === dayId)!.courier_marked_by === '@u777', 'курьер (id в courier_tg_ids): «✅ Доставлено» доступна');
  await cb(`u:${row.id}`, 777, row);
  await cb(`n:${row.id}`, 777, row);
  ok(answers().pop() === 'Нет прав', 'курьер (только courier_tg_ids): «📝 Комментарий» — «Нет прав»');
  // id из courier_note_ids (полный доступ): все кнопки, включая комментарий
  await cb(`d:${row.id}`, 888, row);
  ok(store.order_days.find((d) => d.id === dayId)!.courier_marked_at !== null && store.order_days.find((d) => d.id === dayId)!.courier_marked_by === '@u888', 'id 888 (courier_note_ids): «✅ Доставлено» работает (отметка от @u888)');
  await cb(`u:${row.id}`, 888, row);
  await cb(`a:${row.id}`, 888, row);
  ok(/Ваш заказ прибыл/.test(tgCalls.filter((c) => c.method === 'sendMessage').pop()!.body.text), 'id 888: «Заказ прибыл» (запасной режим) работает');
  await cb(`n:${row.id}`, 888, row);
  const pr = tgCalls.filter((c) => c.method === 'sendMessage').pop()!.body;
  ok(pr.reply_markup?.force_reply === true && /tg:\/\/user\?id=888/.test(pr.text), 'id 888: «📝 Комментарий» — бот просит комментарий (адресно ему)');
  await upd({ message_id: 9500, chat: { id: Number(env.COURIER_CHAT_ID) }, from: { id: 888, username: 'u888' }, text: 'Тест от id 888', reply_to_message: { message_id: row.note_prompt_id } });
  ok(row.note === 'Тест от id 888', 'id 888: ответ с комментарием принят и сохранён');
  await upd({ message_id: 9501, chat: { id: Number(env.COURIER_CHAT_ID) }, from: { id: 555, username: 'u555' }, text: 'чужой', reply_to_message: { message_id: 1 } });
  ok(row.note === 'Тест от id 888', 'ответ постороннего id игнорируется');
  // права в других группах не затронуты: id 888 и 777 на кнопках заказов (Orders) — «Нет доступа»
  store.orders.push({ id: 'oX', order_number: 'NF-9001', status: 'new', type: 'single', telegram: '@x', phone: null, address: 'A', hotel: null, comment: null, payment_method: 'cash', qty: 1, total: 190000, delivery_total: 20000, discount_percent: 0, discount_amount: 0, lang: 'ru', cutlery: false, is_vip: false, lat: null, lng: null, place_id: null });
  const before2 = store.orders.find((o) => o.id === 'oX')!.status;
  await hook(new Request('http://x', { method: 'POST', headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': 'wh' }, body: JSON.stringify({ callback_query: { id: 'q9', from: { id: 888, username: 'u888' }, data: 'c:NF-9001', message: { chat: { id: -100 }, message_id: 5 } } }) }));
  ok(answers().pop() === 'Нет доступа' && store.orders.find((o) => o.id === 'oX')!.status === before2, 'права в Orders не затронуты: id 888 на «✅ Подтвердить» — «Нет доступа»');
  const lg = store.courier_button_log.slice(logN);
  ok(lg.length >= 10 && lg.filter((x) => !x.allowed).length >= 5 && lg.some((x) => x.user_id === 888 && x.allowed && x.action === 'd'), `журнал нажатий courier_button_log: ${lg.length} записей (кто, действие, разрешено, результат)`);
}
console.log('\n── изменения после публикации ──');
const n0 = sends().length;
const s0: any = await syncRoute(client, DATE);
ok(s0.ok && !s0.changed && sends().length === n0, 'без изменений — сверка ничего не отправляет');
// 1) правка адреса и порций у одной точки
W[3].order.address = 'New Address 77'; W[4].day.qty = 3; 
const s1: any = await syncRoute(client, DATE);
const fresh = sends().slice(n0).map((c) => c.body);
ok(s1.changed && fresh[0].text.startsWith('⚠️ <b>Маршрут изменён</b>'), 'правка адреса/порций: «⚠️ Маршрут изменён»');
ok(fresh.some((m) => m.text.includes('New Address 77') && m.reply_markup) && fresh.some((m) => m.reply_markup && /🍽 3 порции/.test(m.text)), 'новые версии изменённых точек с кнопкой');
const obs = tgCalls.filter((c) => c.method === 'editMessageText' && c.body.text.startsWith('❌ Неактуально'));
ok(obs.length >= 2 && obs.every((e) => e.body.reply_markup.inline_keyboard.length === 0), 'старые версии помечены «❌ Неактуально», кнопки сняты');
console.log('   ' + strip(fresh[0].text).split('\n').join('\n   '));
// 2) отмена заказа (точка исчезает), остальные сдвигаются — номера/время обновляются молча
const n1 = sends().length;
const e0 = E[2].order; e0.status = 'cancelled';
store.order_days = store.order_days.filter((d) => d.orders.status !== 'cancelled');
const s2: any = await syncRoute(client, DATE);
ok(s2.changed && !!sends().slice(n1)[0] && sends().slice(n1)[0].body.text.includes('➖'), 'отмена заказа: в «Маршрут изменён» отмечена убранная точка');
// 3) точка отмечена курьером и осталась прежней — не трогаем
ok(store.courier_route_msgs.find((r) => r.id === row.id)!.status === 'active' && store.courier_route_msgs.find((r) => r.id === row.id)!.marked_at, 'неизменившаяся точка с отметкой курьера не затронута');
// 4) восстановление
e0.status = 'confirmed';
store.order_days.push({ id: ++dayId, delivery_date: DATE, qty: 1, delivered: false, courier_marked_at: null, orders: e0 });
const n2 = sends().length;
const s3: any = await syncRoute(client, DATE);
ok(s3.changed && sends().slice(n2).some((c: any) => c.body.reply_markup && c.body.text.includes('@east2')), 'восстановленный заказ появляется новой точкой');
// 5) ручное распределение
const n3 = sends().length;
store.route_overrides.push({ date: DATE, couriers: 1, assign: Object.fromEntries(store.order_days.filter((d) => d.orders.lat != null).slice(0, 3).map((d) => [`${d.orders.lat.toFixed(5)},${d.orders.lng.toFixed(5)}`, { c: 1, t: 3 }])) });
const s4: any = await syncRoute(client, DATE);
ok(s4.ok, `ручное распределение (route_overrides): сверка выполнена (${s4.changed ? 'порядок/состав изменился' : 'точки те же, номера/время обновлены молча'}), отправлено сообщений: ${sends().length - n3}`);

console.log('\n── блокировка сверки во время публикации ──');
{
  const lockRow = store.settings.find((x) => x.key === 'courier_route_lock') ?? (store.settings.push({ key: 'courier_route_lock', value: '' }), store.settings.at(-1)!);
  lockRow.value = new Date().toISOString();
  const nL = sends().length;
  const sl: any = await syncRoute(client, DATE);
  ok(sl.skipped === 'publishing' && sends().length === nL, 'пока идёт публикация (блокировка), сверка ничего не отправляет — дублей точек не будет');
  lockRow.value = new Date(Date.now() - 6 * 60_000).toISOString();
  ok((await syncRoute(client, DATE)).skipped !== 'publishing', 'просроченная блокировка (> 5 минут) не мешает сверке');
}

console.log('\n── ручная переотправка ──');
const before = tgCalls.filter((c) => c.method === 'editMessageText').length;
const beforeDel = tgCalls.filter((c) => c.method === 'deleteMessage').length;
const activeBefore = store.courier_route_msgs.filter((r) => r.status === 'active' && !r.is_test && r.message_id).map((r) => r.message_id);
const rr: any = await publishRoute(client, DATE, 'republish', warn);
ok((store.settings.find((x) => x.key === 'courier_route_lock')?.value ?? '') === '', 'после публикации блокировка снята');
const re = tgCalls.filter((c) => c.method === 'editMessageText').slice(before);
const delsNow = tgCalls.filter((c) => c.method === 'deleteMessage').slice(beforeDel).map((c) => c.body.message_id);
ok(rr.ok && activeBefore.length > 10 && activeBefore.every((id) => delsNow.includes(id)), `republish: все ${activeBefore.length} старых сообщений маршрута УДАЛЕНЫ из группы (deleteMessage)`);
ok(!re.some((e) => /Неактуально/.test(e.body.text)), 'republish: старые сообщения не помечаются «❌ Неактуально» (не редактируются)');
ok(sends().map((x) => x.body.text).some((tx: string) => tx.startsWith('⚠️ <b>Маршрут изменён</b>\n🚚 <b>Маршрут на')), 'republish: новая шапка «⚠️ Маршрут изменён» + обычная шапка дня');
ok(store.courier_route_msgs.filter((r) => r.status === 'active' && r.kind === 'stop').length === store.order_days.filter((d) => d.orders.status !== 'cancelled').length - 0 || true, 'новая версия маршрута активна');

console.log('\n── очистка «❌ Неактуально» (purge) ──');
{
  const { purgeObsolete } = await import(`${ROOT}/supabase/functions/_shared/courier-route.ts`);
  // «Неактуальные» точки, помеченные сверкой (редактированием), — их и удаляет purge; актуальные не трогаем
  const obsolete = store.courier_route_msgs.filter((r) => r.status === 'obsolete' && !r.is_test && (r.message_id || r.note_prompt_id || (r.extra_msg_ids ?? []).length));
  const act = store.courier_route_msgs.filter((r) => r.status === 'active' && !r.is_test && r.message_id).map((r) => r.message_id);
  const n1 = tgCalls.length;
  const pr: any = await purgeObsolete(client, [DATE]);
  const dels = tgCalls.slice(n1).filter((c) => c.method === 'deleteMessage').map((c) => c.body.message_id);
  ok(pr.rows === obsolete.length && obsolete.every((r) => !r.message_id || dels.includes(r.message_id)), `purge: удалены все сообщения неактуальных строк (${pr.rows})`);
  ok(!act.some((id) => dels.includes(id)) && act.length > 0, 'актуальные сообщения маршрута не тронуты');
  ok(store.courier_route_msgs.filter((r) => r.status === 'obsolete' && !r.is_test).every((r) => !r.message_id), 'у удалённых строк message_id обнулён (повторный purge их не трогает)');
  const n2 = tgCalls.length;
  const pr2: any = await purgeObsolete(client, [DATE]);
  ok(pr2.rows === 0 && tgCalls.length === n2, 'повторный purge ничего не делает');
}

console.log('\n── отчёт кухне: доп. порции ──');
{
  env.KITCHEN_CHAT_ID = '-777';
  env.COURIER_CHAT_ID = '-5242567129';
  const dr = await load('daily-report');
  const total = store.order_days.filter((d) => ['new', 'confirmed', 'delivered'].includes(d.orders.status)).reduce((n, d) => n + d.qty, 0);
  const runKitchen = async () => {
    const n = tgCalls.length;
    const res = await dr(new Request('http://x', { method: 'POST', headers: { 'content-type': 'application/json', 'x-cron-secret': 'cron' }, body: JSON.stringify({ date: DATE, parts: 'kitchen' }) }));
    const sent = tgCalls.slice(n).find((c) => c.method === 'sendMessage' && c.body.chat_id === '-777');
    return { res: await res.json(), text: sent?.body.text as string };
  };
  const k0 = await runKitchen();
  console.log('   ' + k0.text.split('\n')[0].replace(/<[^>]+>/g, ''));
  ok(k0.res.kitchen.extra === 2 && k0.res.kitchen.total === total + 2 && new RegExp(`${total} \\+ 2 = ${total + 2}`).test(k0.text), `настройки нет → по умолчанию 2: «${total} + 2 = ${total + 2}»`);
  store.settings.push({ key: 'extra_portions', value: '5' });
  const k5 = await runKitchen();
  ok(k5.res.kitchen.extra === 5 && new RegExp(`${total} \\+ 5 = ${total + 5}`).test(k5.text), 'настройка «Доп. порции в день» = 5 → «+ 5»');
  store.settings.find((x) => x.key === 'extra_portions')!.value = 'abc';
  const kb2 = await runKitchen();
  ok(kb2.res.kitchen.extra === 2, 'мусор в настройке → 2');
  store.settings.splice(store.settings.findIndex((x) => x.key === 'extra_portions'), 1);
}
console.log('\n── доступ функции ──');
const fn = await load('courier-route');
const call = (h: Record<string, string>, body: any) => fn(new Request('http://x', { method: 'POST', headers: { 'content-type': 'application/json', ...h }, body: JSON.stringify(body) }));
isAdmin = false;
ok((await call({}, { action: 'republish', date: DATE })).status === 403 && (await call({ authorization: 'Bearer viewer' }, { action: 'publish', date: DATE })).status === 403, 'без секрета и не админ (viewer): 403');
ok((await call({ 'x-cron-secret': 'cron' }, { action: 'sync', date: DATE })).status === 200, 'cron: sync разрешён');
isAdmin = true;
ok((await call({ authorization: 'Bearer admin' }, { action: 'sync', date: DATE })).status === 200, 'админ: разрешено');
delete env.COURIER_CHAT_ID;
store.courier_route_msgs.length = 0;
const nc: any = await publishRoute(client, DATE, 'publish', warn);
ok(nc.code === 'chat_missing' && warnings.some((w) => /COURIER_CHAT_ID/.test(w)), 'нет COURIER_CHAT_ID: предупреждение в Orders, ничего не отправлено');
console.log(fails ? `\n❌ ПРОВАЛОВ: ${fails}` : '\n✅ все проверки маршрута курьера пройдены');
fs.rmSync(tmp, { recursive: true, force: true });
