// Наличные: «Взять наличными» только в первый день заказа, дальше «Оплачено (наличные взяты в 1-й день)» (вкладка/отчёт/группа курьера) + напоминание в Orders в 17:00 — на заглушках.
//   node --experimental-strip-types tools/cash-check/check.mts
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cash-'));
let fails = 0;
const ok = (c: boolean, msg: string) => { if (!c) { fails++; console.log('  ❌', msg); } else console.log('  ✅', msg); };

const store: Record<string, any[]> = { order_days: [] };
const get = (r: any, p: string) => p.split('.').reduce((o, k) => o?.[k], r);
function from(name: string) {
  const filters: ((r: any) => boolean)[] = [];
  const run = () => Promise.resolve({ data: (store[name] ?? []).filter((r) => filters.every((f) => f(r))), error: null });
  const q: any = { select: () => q, eq: (c: string, v: any) => (filters.push((r) => get(r, c) === v), q), in: (c: string, vs: any[]) => (filters.push((r) => vs.includes(get(r, c))), q), then: (a: any, b: any) => run().then(a, b) };
  return q;
}
let isAdmin = false;
const client = { from, rpc: async (fn: string) => ({ data: fn === 'is_admin' ? isAdmin : null, error: null }) };
(globalThis as any).__client = client;
fs.writeFileSync(path.join(tmp, 'stub-supabase.mts'), 'export function createClient() { return (globalThis as any).__client; }\n');
const tgCalls: { method: string; body: any }[] = [];
(globalThis as any).fetch = async (url: string, init: any) => {
  const m = /api\.telegram\.org\/bot[^/]*\/(\w+)/.exec(String(url));
  if (!m) throw new Error('внешний запрос запрещён в проверке: ' + url);
  tgCalls.push({ method: m[1], body: JSON.parse(init.body) });
  return { json: async () => ({ ok: true, result: { message_id: 1 } }) };
};
const env: Record<string, string> = { CRON_SECRET: 'cron', ORDERS_CHAT_ID: '-100', TELEGRAM_BOT_TOKEN: 'x', SUPABASE_URL: 'u', SUPABASE_ANON_KEY: 'a', SUPABASE_SERVICE_ROLE_KEY: 's' };
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
const R = `${ROOT}/supabase/functions/_shared`;
const { buildCourierReport } = await import(`${R}/courier-report.ts`);
const { buildRoutePlan, rowKeyboard } = await import(`${R}/courier-route.ts`);
const { planDay, DEFAULT_TRIP_SETTINGS } = await import(`${R}/trips.ts`);

const K = { lat: 16.0462726, lng: 108.2356202 };
const TODAY = '2026-11-05'; // Чт
const mk = (nick: string, n: number, o: any = {}) => ({ order_number: `NF-${1070 + n}`, telegram: nick, phone: '+84901234567', address: `Street ${n}`, hotel: null, comment: null, lat: K.lat + n / 111, lng: K.lng + 3 / 107, place_id: null, qty: 1, payment_method: 'cash', total: 850000, cutlery: false, sub: null, firstDay: true, status: 'confirmed', dayIds: [n], ...o });
const items = [
  mk('@firstday', 0, { firstDay: true }),                      // 1-й день, не отмечен → Взять наличными
  mk('@secondday', 1, { firstDay: false }),                    // 2-й день того же наличного заказа → Оплачено (наличные взяты в 1-й день)
  mk('@qrclient', 2, { payment_method: 'qr', firstDay: false }), // QR → просто Оплачено
  mk('@qrfirst', 3, { payment_method: 'qr', firstDay: true }),
];
const strip = (t: string) => t.replace(/<[^>]+>/g, '');
console.log('── ночной отчёт курьеру ──');
const report = strip(buildCourierReport(TODAY, items, '13:00', '16:00', { kitchen: K, couriers: 1, trip: DEFAULT_TRIP_SETTINGS }).join('\n\n'));
const block = (nick: string) => { const i = report.indexOf(nick); return report.slice(i, report.indexOf('\n\n', i)); };
console.log(['@firstday', '@secondday', '@qrclient'].map((n) => block(n).split('\n').map((l) => '    ' + l).join('\n')).join('\n    ───\n'));
ok(/Взять наличными: 850 000 ₫/.test(block('@firstday')) && !/Оплачено/.test(block('@firstday')), '1-й день (не отмечен): «💵 Взять наличными: 850 000 ₫»');
ok(/✅ Оплачено \(наличные взяты в 1-й день\)/.test(block('@secondday')) && !/Взять наличными/.test(block('@secondday')), '2-й день: «✅ Оплачено (наличные взяты в 1-й день)», «Взять наличными» нет');
ok(/✅ Оплачено$/m.test(block('@qrclient')) && !/наличные взяты/.test(block('@qrclient')), 'QR во 2-й день: просто «✅ Оплачено»');
ok(/Наличными: 850 000 ₫/.test(report), 'в шапке «Наличными» — только 850 000 (первый день), без дублей');

console.log('\n── группа курьера (точки) ──');
const plan = planDay(items, { lat: (d: any) => d.lat, lng: (d: any) => d.lng, address: (d: any) => d.address, qty: (d: any) => d.qty }, K, 1, DEFAULT_TRIP_SETTINGS);
const rp = buildRoutePlan(TODAY, plan, 1);
const stop = (nick: string) => strip(rp.trips.flatMap((t) => t.stops).find((s) => s.title.includes(nick))!.title);
ok(/Взять наличными: 850 000 ₫/.test(stop('@firstday')) && /Оплачено \(наличные взяты в 1-й день\)/.test(stop('@secondday')) && !/наличные взяты/.test(stop('@qrclient')), 'сообщения точек: 1-й день — «Взять наличными», 2-й — «Оплачено (наличные взяты в 1-й день)», QR — «Оплачено»');
const sigOf = (nick: string) => rp.trips.flatMap((t) => t.stops).find((s) => s.title.includes(nick))!.body;
ok(!sigOf('@secondday').includes('наличные взяты'), 'смена формулировки не считается изменением точки (сверка не шлёт «Маршрут изменён»)');
void rowKeyboard;
// объединённые заказы одного клиента: 1-й день одного заказа + 2-й день другого
const merged = [mk('@both', 5, { firstDay: true, dayIds: [11] }), { ...mk('@both', 6, { firstDay: false, dayIds: [12] }), address: 'Street 5', lat: K.lat + 5 / 111, lng: K.lng + 3 / 107 }];
const mrp = buildRoutePlan(TODAY, planDay(merged, { lat: (d: any) => d.lat, lng: (d: any) => d.lng, address: (d: any) => d.address, qty: (d: any) => d.qty }, K, 1, DEFAULT_TRIP_SETTINGS), 1);
ok(/Взять наличными: 850 000 ₫/.test(strip(mrp.trips[0].stops[0].title)) && mrp.trips[0].stops.length === 1, 'объединённая точка: берём наличные только за заказ в 1-й день (850 000, не 1 700 000)');

console.log('\n── напоминание в Orders (17:00) ──');
const od = (n: number, o: any, day = TODAY, order: any = {}) => store.order_days.push({ id: n, delivery_date: day, delivered: false, courier_marked_at: null, ...o, orders: { order_number: `NF-${1070 + n}`, telegram: `@c${n}`, total: 850000, status: 'confirmed', payment_method: 'cash', order_days: [{ delivery_date: day }, { delivery_date: '2026-11-06' }], ...order } });
od(1, {});                                                                // 1-й день, не закрыт → в списке
od(2, { courier_marked_at: '2026-11-05T06:42:00Z' });                     // курьер отметил 13:42, админ не закрыл → в списке с пометкой
od(3, { delivered: true });                                               // закрыт → нет
od(4, {}, TODAY, { order_days: [{ delivery_date: '2026-11-04' }, { delivery_date: TODAY }] }); // 2-й день → нет
od(5, {}, TODAY, { payment_method: 'qr' });                               // QR → нет
od(6, {}, TODAY, { status: 'new' });                                      // не подтверждён → нет
od(7, {}, '2026-11-04');                                                  // другой день → нет
const fn = await load('cash-reminder');
const post = (h: Record<string, string>, body: any = {}) => fn(new Request('http://x', { method: 'POST', headers: { 'content-type': 'application/json', ...h }, body: JSON.stringify(body) }));
isAdmin = false;
ok((await post({}, { date: TODAY })).status === 403 && (await post({ authorization: 'Bearer viewer' }, { date: TODAY })).status === 403 && tgCalls.length === 0, 'без секрета и не админ (viewer): 403, ничего не отправлено');
const r1 = await (await post({ 'x-cron-secret': 'cron' }, { date: TODAY })).json();
const msg = tgCalls.find((c) => c.method === 'sendMessage')!.body;
console.log(strip(msg.text).split('\n').map((l: string) => '    ' + l).join('\n'));
ok(r1.ok && r1.count === 2 && r1.total === 1700000 && msg.chat_id === '-100', 'в Orders уходит напоминание: 2 точки, 1 700 000 ₫');
ok(/Не закрыты наличные за Чт, 05\.11/.test(msg.text) && /@c1 · NF-1071 — 850 000 ₫ · не отмечено/.test(msg.text) && /@c2 · NF-1072 — 850 000 ₫ · 🚴 курьер отметил 13:42/.test(msg.text), 'список: ник, заказ, сумма, «не отмечено» / «🚴 курьер отметил 13:42»');
ok(!/NF-1073|NF-1074|NF-1075|NF-1076|NF-1077/.test(msg.text), 'закрытые, 2-й день, QR, неподтверждённые и другие дни не попадают');
ok(msg.reply_markup.inline_keyboard[0][0].url === `https://ninifoodvn.com/admin?tab=courier&date=${TODAY}`, 'кнопка «✏️ Открыть в админке» → вкладка «Курьер»');
const n0 = tgCalls.length;
store.order_days.splice(0, store.order_days.length);
const r2 = await (await post({ 'x-cron-secret': 'cron' }, { date: TODAY })).json();
ok(r2.count === 0 && tgCalls.length === n0, 'все наличные закрыты — ничего не отправляется');
const rs = await (await post({ 'x-cron-secret': 'cron' }, { date: '2026-11-08' })).json();
ok(rs.skipped === 'sunday' && tgCalls.length === n0, 'воскресенье — пропуск');
isAdmin = true;
ok((await post({ authorization: 'Bearer admin' }, { date: TODAY })).status === 200, 'админ может запустить вручную');
console.log(fails ? `\n❌ ПРОВАЛОВ: ${fails}` : '\n✅ все проверки наличных пройдены');
fs.rmSync(tmp, { recursive: true, force: true });
