// Проверка ЗП курьера целиком (недельный отчёт + кнопки Telegram) на заглушках: без БД, без Telegram, без Google.
//   node --experimental-strip-types tools/payroll-check/check.mts
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'payroll-'));
let fails = 0;
const ok = (c: boolean, msg: string) => { if (!c) { fails++; console.log('  ❌', msg); } else console.log('  ✅', msg); };

// ── заглушки ──
const store: Record<string, any[]> = { orders: [], settings: [], order_days: [], route_overrides: [], courier_pay_days: [], courier_payouts: [], cash_movements: [] };
let seq = 100;
const get = (r: any, p: string) => p.split('.').reduce((o, k) => o?.[k], r);
function from(name: string) {
  const filters: ((r: any) => boolean)[] = [];
  let mode: 'select' | 'upsert' | 'update' = 'select';
  let up: any = null, patch: any = null;
  const run = (single: boolean) => {
    const t = store[name];
    if (mode === 'upsert') {
      const keys = String(up.onConflict).split(',');
      let r = t.find((x) => keys.every((k) => x[k] === up.obj[k]));
      if (r) Object.assign(r, up.obj); else { r = { id: ++seq, ...up.obj }; t.push(r); }
      return Promise.resolve({ data: single ? r : [r], error: null });
    }
    const hit = t.filter((r) => filters.every((f) => f(r)));
    if (mode === 'update') { hit.forEach((r) => Object.assign(r, patch)); return Promise.resolve({ data: hit, error: null }); }
    return Promise.resolve({ data: single ? (hit[0] ?? null) : hit, error: null });
  };
  const q: any = {
    select: () => q, eq: (c: string, v: any) => (filters.push((r) => get(r, c) === v), q), in: (c: string, vs: any[]) => (filters.push((r) => vs.includes(get(r, c))), q),
    upsert: (obj: any, o: any) => ((mode = 'upsert'), (up = { obj, onConflict: o.onConflict }), q), update: (p: any) => ((mode = 'update'), (patch = p), q),
    maybeSingle: () => run(true), single: () => run(true), then: (a: any, b: any) => run(false).then(a, b),
  };
  return q;
}
let isAdminJwt = false;
const rpcLog: any[] = [];
const client = {
  from,
  rpc: async (fn: string, args: any) => {
    if (fn === 'is_admin') return { data: isAdminJwt, error: null };
    // эмуляция courier_payout_pay (как в SQL: блокировка выплаты, один расход на выплату)
    rpcLog.push(fn);
    const po = store.courier_payouts.find((p) => p.id === args.p_payout);
    if (!po) return { data: { status: 'not_found' }, error: null };
    if (po.status === 'paid') return { data: { status: 'already', amount: po.paid_amount }, error: null };
    const sum = args.p_days.reduce((s: number, d: any) => s + d.amount, 0);
    if (sum !== args.p_amount || args.p_amount <= 0) return { data: { status: 'bad_request' }, error: null };
    if (store.cash_movements.some((m) => m.payout_id === po.id)) return { data: { status: 'already' }, error: null };
    store.cash_movements.push({ id: ++seq, type: 'out', amount: args.p_amount, payout_id: po.id, category: 'ЗП курьера' });
    for (const d of args.p_days) {
      let r = store.courier_pay_days.find((x) => x.date === d.date && x.courier === d.courier);
      if (!r) store.courier_pay_days.push((r = { date: d.date, courier: d.courier, addresses_manual: null, km_manual: null }));
      Object.assign(r, { paid_at: new Date().toISOString(), paid_by: args.p_by, paid_addresses: d.addresses, paid_km: d.km, paid_amount: d.amount, payout_id: po.id });
    }
    Object.assign(po, { status: 'paid', paid_at: new Date().toISOString(), paid_by: args.p_by, paid_amount: args.p_amount });
    return { data: { status: 'paid', amount: args.p_amount }, error: null };
  },
};
fs.writeFileSync(path.join(tmp, 'stub-supabase.mts'), 'export const client: any = (globalThis as any).__client;\nexport function createClient() { return client; }\n');
(globalThis as any).__client = client;

const tgCalls: { method: string; body: any }[] = [];
let msgId = 500;
(globalThis as any).fetch = async (url: string, init: any) => {
  const m = /api\.telegram\.org\/bot[^/]*\/(\w+)/.exec(String(url));
  if (!m) throw new Error('внешний запрос запрещён в проверке: ' + url);
  const body = JSON.parse(init.body);
  tgCalls.push({ method: m[1], body });
  return { json: async () => ({ ok: true, result: { message_id: ++msgId } }) };
};
const env: Record<string, string> = { CRON_SECRET: 'cron', ORDERS_CHAT_ID: '-100', TG_WEBHOOK_SECRET: 'wh', ADMIN_TG_IDS: '11,22', TELEGRAM_BOT_TOKEN: 'x', SUPABASE_URL: 'u', SUPABASE_ANON_KEY: 'a', SUPABASE_SERVICE_ROLE_KEY: 's' };
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

// ── данные: неделя 02.11–07.11, кухня, настройки ──
const S = (key: string, value: string) => store.settings.push({ key, value });
S('kitchen_lat', '16.0462726'); S('kitchen_lng', '108.2356202'); S('couriers_count', '1'); S('trip_capacity', '9'); S('courier_pay_per_address', '20000'); S('courier_fuel_l100', '2.2'); S('courier_fuel_price', '26000');
let n = 0;
const od = (date: string, tg: string, e: number, nn: number, status = 'confirmed', addr?: string) => store.order_days.push({ delivery_date: date, qty: 1, orders: { status, telegram: tg, address: addr ?? `Addr ${tg}`, lat: 16.0462726 + nn / 111, lng: 108.2356202 + e / 107 } });
for (let i = 0; i < 5; i++) od('2026-11-02', `@c${i}`, 1 + i * 0.4, 1 + i * 0.3);
od('2026-11-02', '@same', 3, 3, 'confirmed', 'House 1'); od('2026-11-02', '@same', 3, 3, 'confirmed', 'House 1'); od('2026-11-02', '@other', 3, 3, 'delivered', 'House 1'); // 2 заказа одного клиента + другой клиент на том же адресе
od('2026-11-02', '@cancelled', 2, 2, 'cancelled'); od('2026-11-02', '@pending', 2, 2, 'new'); // не платим
for (let i = 0; i < 4; i++) od('2026-11-03', `@d${i}`, -1 - i * 0.5, -1 - i * 0.2);
for (let i = 0; i < 3; i++) od('2026-10-30', `@old${i}`, 1 + i, 1 + i); // до 02.11 — не считается
void n;

const payroll = await load('courier-payroll');
const post = (body: any, headers: Record<string, string> = {}) => payroll(new Request('http://x', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) }));
console.log('\n── недельный отчёт ──');
isAdminJwt = false;
let r = await post({ action: 'weekly', date: '2026-11-08' });
ok(r.status === 403, 'без секрета и не админ (viewer/аноним): 403 forbidden');
ok(tgCalls.length === 0 && store.courier_payouts.length === 0, 'при отказе ничего не отправлено и не записано');
r = await post({ action: 'weekly', date: '2026-11-08' }, { 'x-cron-secret': 'cron' });
const body1: any = await r.json();
ok(r.status === 200 && body1.ok && body1.amount > 0, `отчёт отправлен, к выплате ${body1.amount} ₫`);
const rep = tgCalls.find((c) => c.method === 'sendMessage')!;
console.log(rep.body.text.replace(/<[^>]+>/g, '').split('\n').map((l: string) => '    ' + l).join('\n'));
ok(/Пн 02\.11 — 7 адр\./.test(rep.body.text), '02.11: 7 адресов (5 + @same×2→1 + @other; отменённый и новый не считаются)');
ok(/Вт 03\.11 — 4 адр\./.test(rep.body.text), '03.11: 4 адреса');
const kb = rep.body.reply_markup.inline_keyboard[0];
ok(kb[0].callback_data === `p:ok:${body1.payout_id}` && kb[0].text.includes('Одобрить') && /admin\?tab=courier&date=2026-11-02/.test(kb[1].url), 'кнопки «✅ Одобрить» и «✏️ Открыть в админке»');
ok(store.cash_movements.length === 0, 'до «Да» расхода в кассе нет');
{
  const nOld = tgCalls.length;
  const ro = await post({ action: 'weekly', date: '2026-11-01' }, { 'x-cron-secret': 'cron' });
  const bo: any = await ro.json();
  ok(bo.ok && bo.skipped === 'no_deliveries' && tgCalls.length === nOld && store.courier_payouts.length === 1, 'неделя 26–31.10 (раньше «Учитывать ЗП с даты» 02.11): отчёта и записи выплаты нет');
}
const payoutId = body1.payout_id;
const total1 = body1.amount;

console.log('\n── кнопки ──');
const hook = await load('tg-webhook');
const cb = (data: string, from = 11) => hook(new Request('http://x', { method: 'POST', headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': 'wh' }, body: JSON.stringify({ callback_query: { id: 'q' + ++seq, from: { id: from, username: from === 11 ? 'boss' : 'rando' }, data, message: { chat: { id: -100 }, message_id: 777 } } }) }));
const last = () => tgCalls[tgCalls.length - 1];
const answers = () => tgCalls.filter((c) => c.method === 'answerCallbackQuery').map((c) => c.body.text);
const before = tgCalls.length;
await cb(`p:ok:${payoutId}`, 999);
ok(answers().pop() === 'Нет прав' && tgCalls.length === before + 1, 'чужой (не админ) нажал «Одобрить»: «Нет прав», ничего не отправлено');
await cb(`p:yes:${payoutId}:${total1}`, 999);
ok(store.cash_movements.length === 0 && store.courier_payouts[0].status === 'pending', 'чужой нажал «Да»: расхода нет, статус не изменился');
await cb(`p:ok:${payoutId}`);
const conf = tgCalls.filter((c) => c.method === 'sendMessage').pop()!;
ok(/Списать/.test(conf.body.text) && conf.body.text.includes('ЗП курьера за 02.11–07.11') && conf.body.reply_markup.inline_keyboard[0][0].callback_data === `p:yes:${payoutId}:${total1}`, 'админ «Одобрить» → «Списать … ₫ как ЗП курьера за 02.11–07.11?» с «Да»/«Отмена»');
ok(store.cash_movements.length === 0, 'после «Одобрить» расхода всё ещё нет');
await cb(`p:no:${payoutId}`);
ok(store.cash_movements.length === 0 && /Отменено/.test(last().body.text ?? tgCalls.filter((c) => c.method === 'editMessageText').pop()!.body.text), '«Отмена»: ничего не списано');

// правки в админке после отправки отчёта: курьер 1, 02.11 — км по спидометру
store.courier_pay_days.push({ date: '2026-11-02', courier: 1, addresses_manual: null, km_manual: 40, paid_at: null });
await cb(`p:yes:${payoutId}:${total1}`);
const edit = tgCalls.filter((c) => c.method === 'editMessageText').pop()!.body;
ok(/Сумма изменилась/.test(edit.text) && store.cash_movements.length === 0, 'после правки км «Да» со старой суммой: «Сумма изменилась…», показана новая сумма, списания нет');
const newTotal = Number(/p:yes:\d+:(\d+)/.exec(edit.reply_markup.inline_keyboard[0][0].callback_data)![1]);
ok(newTotal !== total1, `новая сумма ${newTotal} ₫ (была ${total1} ₫)`);
await cb(`p:yes:${payoutId}:${newTotal}`);
ok(store.cash_movements.length === 1 && store.cash_movements[0].amount === newTotal && store.cash_movements[0].category === 'ЗП курьера', 'подтверждённая новая сумма: ровно один расход «ЗП курьера» на эту сумму');
const po = store.courier_payouts[0];
ok(po.status === 'paid' && po.paid_amount === newTotal, 'выплата помечена выплаченной');
ok(store.courier_pay_days.filter((d) => d.paid_at).length === 2 && store.courier_pay_days.find((d) => d.date === '2026-11-02')!.paid_km === 40, 'дни помечены «выплачено», зафиксированы правленые км (40)');
ok(tgCalls.filter((c) => c.method === 'editMessageText').some((c) => /Выплачено/.test(c.body.text) && /@boss/.test(c.body.text)), 'сообщение стало «✅ Выплачено Y ₫ · кто · когда»');

console.log('\n── повторы и гонки ──');
await cb(`p:yes:${payoutId}:${newTotal}`);
ok(store.cash_movements.length === 1 && answers().pop() === 'Уже выплачено', 'повторное «Да»: второго расхода нет («Уже выплачено»)');
await cb(`p:ok:${payoutId}`);
ok(store.cash_movements.length === 1 && answers().pop() === 'Уже выплачено', 'повторное «Одобрить» после выплаты: тоже «Уже выплачено»');
// гонка: две выплаты параллельно на новой неделе
od('2026-11-09', '@w0', 1, 1); od('2026-11-09', '@w1', 2, 2);
r = await post({ action: 'weekly', date: '2026-11-15' }, { 'x-cron-secret': 'cron' });
const b2: any = await r.json();
ok(b2.ok && b2.payout_id !== payoutId, `следующая неделя: новый отчёт (${b2.amount} ₫)`);
await Promise.all([cb(`p:yes:${b2.payout_id}:${b2.amount}`), cb(`p:yes:${b2.payout_id}:${b2.amount}`)]);
ok(store.cash_movements.filter((m) => m.payout_id === b2.payout_id).length === 1, 'два «Да» одновременно: один расход');
// повторная отправка отчёта за оплаченную неделю не создаёт новой выплаты
r = await post({ action: 'weekly', date: '2026-11-08' }, { 'x-cron-secret': 'cron' });
const b3: any = await r.json();
ok(b3.skipped === 'already_paid' && store.courier_payouts.length === 2, 'отчёт за уже выплаченную неделю не дублируется');

console.log('\n── кнопки заказов (✅/❌) продолжают работать ──');
store.orders.push({ id: 'o1', order_number: 'NF-5001', status: 'new', type: 'single', telegram: '@x', phone: '+84900000000', address: 'A', hotel: null, comment: null, payment_method: 'cash', qty: 1, total: 190000, delivery_total: 20000, discount_percent: 0, discount_amount: 0, lang: 'ru', cutlery: false, is_vip: false, lat: null, lng: null, place_id: null });
store.order_days.push({ delivery_date: '2026-11-20', order_id: 'o1', qty: 1, orders: { status: 'new', telegram: '@x', address: 'A', lat: null, lng: null } });
await cb('c:NF-5001');
ok(store.orders[0].status === 'confirmed' && store.orders[0].status_changed_by === 'boss', 'админ ✅ Подтвердить: статус confirmed, кто нажал записан');
await cb('c:NF-5001', 999);
ok(store.orders[0].status === 'confirmed' && answers().pop() === 'Нет доступа', 'чужой на кнопке заказа: «Нет доступа», ничего не меняется');
await cb('x:NF-5001');
ok(store.orders[0].status === 'cancelled', 'админ ❌ Отклонить: статус cancelled');

console.log(fails ? `\n❌ ПРОВАЛОВ: ${fails}` : '\n✅ все проверки ЗП курьера пройдены');
fs.rmSync(tmp, { recursive: true, force: true });
