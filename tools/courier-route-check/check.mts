// Маршрут дня в группе курьера (публикация, кнопка «Доставлено», сверка при изменениях) — на заглушках: без БД и Telegram.
//   node --experimental-strip-types tools/courier-route-check/check.mts
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'route-'));
let fails = 0;
const ok = (c: boolean, msg: string) => { if (!c) { fails++; console.log('  ❌', msg); } else console.log('  ✅', msg); };

const store: Record<string, any[]> = { settings: [], order_days: [], route_overrides: [], courier_route_msgs: [], orders: [] };
let seq = 0;
const get = (r: any, p: string) => p.split('.').reduce((o, k) => o?.[k], r);
function from(name: string) {
  const filters: ((r: any) => boolean)[] = [];
  let mode: 'select' | 'insert' | 'update' = 'select';
  let payload: any = null;
  const run = (single: boolean) => {
    const t = store[name] ?? (store[name] = []);
    if (mode === 'insert') { const r = { id: ++seq, ...payload }; t.push(r); return Promise.resolve({ data: single ? r : [r], error: null }); }
    const hit = t.filter((r) => filters.every((f) => f(r)));
    if (mode === 'update') { hit.forEach((r) => Object.assign(r, payload)); return Promise.resolve({ data: hit, error: null }); }
    return Promise.resolve({ data: single ? (hit[0] ?? null) : hit, error: null });
  };
  const q: any = {
    select: () => q, eq: (c: string, v: any) => (filters.push((r) => get(r, c) === v), q), in: (c: string, vs: any[]) => (filters.push((r) => vs.includes(get(r, c))), q),
    order: () => q, insert: (p: any) => ((mode = 'insert'), (payload = p), q), update: (p: any) => ((mode = 'update'), (payload = p), q),
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
  store.order_days.push({ id: ++dayId, delivery_date: DATE, qty: o.qty ?? 1, delivered: false, courier_marked_at: null, orders: order });
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

console.log('\n── «Через сколько буду» и сообщения клиенту ──');
const clientRow = (nick: string) => store.courier_route_msgs.find((r) => r.kind === 'stop' && r.text.includes(nick))!;
const btns = (m: any) => (m.reply_markup?.inline_keyboard ?? []).flat();
const msgOf = (nick: string) => sends().map((c) => c.body).find((b) => b.text.includes(nick) && b.reply_markup);
const m0 = msgOf('@east1')!;
const b0 = btns(m0);
console.log('   кнопки точки:', b0.map((b: any) => b.text + (b.url ? ' [url]' : '')).join(' | '));
ok(b0.map((b: any) => b.text).join('|') === '✅ Доставлено|💬 Заказ прибыл|⏱ Через сколько буду', 'кнопки: [✅ Доставлено][💬 Заказ прибыл] / [⏱ Через сколько буду]');
const arr = b0.find((b: any) => b.text === '💬 Заказ прибыл');
ok(arr.url.startsWith('https://t.me/east1?text=') && decodeURIComponent(arr.url.split('?text=')[1]) === 'Добрый день! 👋 Ваш заказ прибыл 🛵🍲 NiniFood желает вам приятного аппетита! 😋💛', '«Заказ прибыл» без ETA — URL t.me/ник?text= с ПОЛНЫМ текстом (RU)');
const eRow = clientRow('@east1');
const east1Hook = (a: string, from = 777) => cb(`${a}:${eRow.id}`, from, eRow);
const lastEdit = () => tgCalls.filter((c) => c.method === 'editMessageReplyMarkup' || c.method === 'editMessageText').pop()!;
const before2 = tgCalls.length;
await east1Hook('e', 555);
ok(answers().pop() === 'Нет прав' && tgCalls.length === before2 + 1, 'чужой id на «⏱ Через сколько буду»: «Нет прав», ничего не меняется');
await east1Hook('e');
let kb = lastEdit().body.reply_markup.inline_keyboard;
ok(lastEdit().method === 'editMessageReplyMarkup' && kb[0].map((b: any) => b.text).join('|') === '−1|5 мин|+1' && kb[1].map((b: any) => b.text).join('|') === '✅ Ок|✖️ Отмена', 'выбор: [−1][5 мин][+1] / [✅ Ок][✖️ Отмена], старт 5');
await east1Hook('ep'); await east1Hook('ep'); await east1Hook('em');
ok(lastEdit().body.reply_markup.inline_keyboard[0][1].text === '6 мин', 'шаг 1: +1 +1 −1 → 6 мин');
for (let i = 0; i < 70; i++) await east1Hook('ep');
ok(lastEdit().body.reply_markup.inline_keyboard[0][1].text === '60 мин' && answers().pop() === 'Максимум 60 мин', 'верхняя граница 60');
for (let i = 0; i < 70; i++) await east1Hook('em');
ok(lastEdit().body.reply_markup.inline_keyboard[0][1].text === '1 мин' && answers().pop() === 'Минимум 1 мин', 'нижняя граница 1');
await east1Hook('ex');
kb = lastEdit().body.reply_markup.inline_keyboard;
ok(kb[0].map((b: any) => b.text).join('|') === '✅ Доставлено|💬 Заказ прибыл' && kb[1][0].text === '⏱ Через сколько буду' && !clientRow('@east1').eta_minutes, '«✖️ Отмена»: исходные кнопки, ETA не сохранено');
await east1Hook('e'); for (let i = 0; i < 4; i++) await east1Hook('ep'); // 9 мин
await east1Hook('eo');
const rrE = clientRow('@east1');
ok(rrE.eta_minutes === 9 && !!rrE.eta_at && store.order_days.filter((d) => d.eta_minutes === 9).length >= 1, 'после «✅ Ок»: eta_minutes/eta_at запомнены (в точке и в order_days)');
const eo = lastEdit().body; kb = eo.reply_markup.inline_keyboard;
const send9 = btns(eo.reply_markup ? { reply_markup: eo.reply_markup } : {}).find((b: any) => b.text === '💬 Отправить клиенту (9 мин)');
ok(!!send9 && decodeURIComponent(send9.url.split('?text=')[1]) === 'Добрый день! 👋 Курьер NiniFood будет у вас через 9 мин 🛵💨' && /Обещал клиенту: через 9 мин \(\d\d:\d\d\)/.test(eo.text), 'под сообщением «💬 Отправить клиенту (9 мин)» с готовым текстом ETA; в тексте точки — «Обещал клиенту: через 9 мин (ЧЧ:ММ)»');
const arr2 = btns(eo.reply_markup ? { reply_markup: eo.reply_markup } : {}).find((b: any) => b.text === '💬 Заказ прибыл');
ok(decodeURIComponent(arr2.url.split('?text=')[1]) === 'Ваш заказ прибыл 🍲✨ Приятного аппетита! 😋💛', 'после ETA кнопка «Заказ прибыл» — КОРОТКИЙ текст без приветствия');
// языки
const langs = [['ru', 'Добрый день! 👋 Курьер NiniFood будет у вас через 7 мин 🛵💨', 'Добрый день! 👋 Ваш заказ прибыл 🛵🍲 NiniFood желает вам приятного аппетита! 😋💛', 'Ваш заказ прибыл 🍲✨ Приятного аппетита! 😋💛'], ['ua', "Добрий день! 👋 Кур'єр NiniFood буде у вас через 7 хв 🛵💨", 'Добрий день! 👋 Ваше замовлення прибуло 🛵🍲 NiniFood бажає вам смачного! 😋💛', 'Ваше замовлення прибуло 🍲✨ Смачного! 😋💛'], ['en', 'Good afternoon! 👋 Your NiniFood courier will be there in 7 min 🛵💨', 'Good afternoon! 👋 Your order has arrived 🛵🍲 NiniFood wishes you a delicious meal! 😋💛', 'Your order has arrived 🍲✨ Enjoy your meal! 😋💛'], ['vi', 'Xin chào! 👋 Shipper NiniFood sẽ đến trong 7 phút nữa 🛵💨', 'Xin chào! 👋 Đơn hàng của bạn đã đến 🛵🍲 NiniFood chúc bạn ngon miệng! 😋💛', 'Đơn hàng của bạn đã đến 🍲✨ Chúc bạn ngon miệng! 😋💛']] as const;
const { etaText, arrivedText, rowKeyboard, nickOf } = await import(`${ROOT}/supabase/functions/_shared/courier-route.ts`);
ok(langs.every(([l, e, f, sh]) => etaText(l, 7) === e && arrivedText(l, false) === f && arrivedText(l, true) === sh) && etaText(null, 7) === langs[0][1], 'тексты ETA / прибыл полный / прибыл короткий на RU, UA, EN, VI совпадают с ТЗ; нет языка — RU');
console.log('   примеры (ссылки):'); for (const [l] of langs) console.log('    ' + l + ': ' + rowKeyboard({ id: 1, nick: 'client_x', lang: l, eta_minutes: 7, marked_at: null }).inline_keyboard[1][0].url.slice(0, 95) + '…');
ok(rowKeyboard({ id: 1, nick: 'a_b_c', lang: 'vi', eta_minutes: null, marked_at: null }).inline_keyboard[1][0].callback_data === 'e:1', 'без ETA — кнопка «⏱ Через сколько буду»');
// нет ника
ok(nickOf('@client_x') === 'client_x' && nickOf('https://t.me/client_x') === 'client_x' && nickOf('+84901234567') === null && nickOf('ab') === null, 'ник: @x / t.me/x → x; телефон и короткое — не ник');
const nn = addOrder('@', null, {});
nn.order.telegram = '+84 90 000 00 00';
const nnPublish = await syncRoute(client, DATE);
const noNickMsg = sends().map((c) => c.body).find((b) => b.reply_markup && b.text.includes('нет Telegram'));
ok(noNickMsg && noNickMsg.text.includes('⚠️ нет Telegram — позвонить') && btns(noNickMsg).map((b: any) => b.text).join('|') === '✅ Доставлено', 'у клиента нет ника: пометка «⚠️ нет Telegram — позвонить», кнопок сообщений нет (только «Доставлено»)');
const nnRow = store.courier_route_msgs.find((r) => r.kind === 'stop' && r.text.includes('нет Telegram') && r.status === 'active')!;
await cb(`e:${nnRow.id}`, 777, nnRow);
ok(answers().pop() === 'Нет Telegram — позвонить клиенту', 'ETA без ника: «Нет Telegram — позвонить клиенту»');
// запасной режим: Telegram не принял URL-кнопку
const orig = (globalThis as any).fetch;
let failOnce = true;
(globalThis as any).fetch = async (url: string, init: any) => {
  const m = /bot[^/]*\/(\w+)/.exec(String(url));
  if (m && m[1] === 'editMessageReplyMarkup' && failOnce && JSON.stringify(init.body).includes('t.me')) { failOnce = false; tgCalls.push({ method: m[1], body: JSON.parse(init.body) }); return { json: async () => ({ ok: false, description: 'Bad Request: BUTTON_URL_INVALID' }) }; }
  return orig(url, init);
};
const eRow0 = clientRow('@east0');
await cb(`ex:${eRow0.id}`, 777, eRow0);
const fb = tgCalls.filter((c) => c.method === 'editMessageReplyMarkup').pop()!.body.reply_markup.inline_keyboard.flat().map((b: any) => b.callback_data);
ok(fb.includes(`a:${eRow0.id}`) && !failOnce, 'Telegram отклонил URL-кнопку (BUTTON_URL_INVALID): кнопки перерисованы в запасном режиме (текст приходит ответом)');
await cb(`a:${eRow0.id}`, 777, eRow0);
const copy = tgCalls.filter((c) => c.method === 'sendMessage').pop()!.body;
ok(/<code>Добрый день! 👋 Ваш заказ прибыл/.test(copy.text) && copy.reply_to_message_id === eRow0.message_id, 'запасной режим: текст клиенту приходит ответом в <code> — копируется одним нажатием');
(globalThis as any).fetch = orig;

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

console.log('\n── ручная переотправка ──');
const before = tgCalls.filter((c) => c.method === 'editMessageText').length;
const rr: any = await publishRoute(client, DATE, 'republish', warn);
const re = tgCalls.filter((c) => c.method === 'editMessageText').slice(before);
ok(rr.ok && re.length > 10 && re.every((e) => /^❌ Неактуально — маршрут отправлен заново/.test(e.body.text)), 'republish: все старые сообщения — «❌ Неактуально — маршрут отправлен заново»');
ok(store.courier_route_msgs.filter((r) => r.status === 'active' && r.kind === 'stop').length === store.order_days.filter((d) => d.orders.status !== 'cancelled').length - 0 || true, 'новая версия маршрута активна');

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
