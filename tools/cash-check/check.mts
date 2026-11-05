// Наличные: «Взять наличными» пока первый день не отмечен «Доставлено» (в следующие дни — с пометкой «не оплачено с ДД.ММ»), после отметки «Оплачено» (вкладка/отчёт/группа курьера) + напоминание в Orders в 17:00 — на заглушках.
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
  mk('@firstday', 0, { cashPending: true, cashSince: null }),                       // 1-й день, не отмечен → Взять наличными
  mk('@secondday', 1, { firstDay: false, cashPending: true, cashSince: '2026-11-04' }), // 2-й день, 1-й так и не отмечен → Взять наличными (не оплачено с 04.11)
  mk('@paidlater', 2, { firstDay: false, cashPending: false, cashSince: null }),        // 2-й день, 1-й отмечен → Оплачено
  mk('@qrclient', 3, { payment_method: 'qr', firstDay: false, cashPending: false }),
];
const strip = (t: string) => t.replace(/<[^>]+>/g, '');
console.log('── ночной отчёт курьеру ──');
const report = strip(buildCourierReport(TODAY, items, '13:00', '16:00', { kitchen: K, couriers: 1, trip: DEFAULT_TRIP_SETTINGS }).join('\n\n'));
const block = (nick: string) => { const i = report.indexOf(nick); return report.slice(i, report.indexOf('\n\n', i)); };
console.log(['@firstday', '@secondday', '@paidlater'].map((n) => block(n).split('\n').map((l) => '    ' + l).join('\n')).join('\n    ───\n'));
ok(/Взять наличными: 850 000 ₫$/m.test(block('@firstday')), '1-й день (не отмечен): «💵 Взять наличными: 850 000 ₫»');
ok(/Взять наличными: 850 000 ₫ \(не оплачено с 04\.11\)/.test(block('@secondday')), '2-й день, первый не отмечен: «💵 Взять наличными: 850 000 ₫ (не оплачено с 04.11)»');
ok(/✅ Оплачено$/m.test(block('@paidlater')) && !/Взять/.test(block('@paidlater')), 'после отметки первого дня: «✅ Оплачено»');
ok(/✅ Оплачено$/m.test(block('@qrclient')), 'QR: «✅ Оплачено»');
ok(/Наличными: 1 700 000 ₫/.test(report), 'в шапке «Наличными» = первый день + невзятые с прошлых дней (1 700 000)');
// старый формат без новых полей (обратная совместимость): наличные только в первый день
const legacy = strip(buildCourierReport(TODAY, [mk('@old1', 7, { firstDay: true }), mk('@old2', 8, { firstDay: false })], '13:00', '16:00', { kitchen: K, couriers: 1, trip: DEFAULT_TRIP_SETTINGS }).join('\n\n'));
ok(/Взять наличными/.test(legacy.slice(legacy.indexOf('@old1'), legacy.indexOf('@old2'))) && /Оплачено/.test(legacy.slice(legacy.indexOf('@old2'))), 'без новых полей поведение прежнее (первый день / оплачено)');

console.log('\n── группа курьера (точки) ──');
const plan = planDay(items, { lat: (d: any) => d.lat, lng: (d: any) => d.lng, address: (d: any) => d.address, qty: (d: any) => d.qty }, K, 1, DEFAULT_TRIP_SETTINGS);
const rp = buildRoutePlan(TODAY, plan, 1);
const stop = (nick: string) => strip(rp.trips.flatMap((t) => t.stops).find((s) => s.title.includes(nick))!.title);
ok(/Взять наличными: 850 000 ₫$/m.test(stop('@firstday')) && /Взять наличными: 850 000 ₫ \(не оплачено с 04\.11\)/.test(stop('@secondday')) && /✅ Оплачено/.test(stop('@paidlater')), 'сообщения точек: 1-й день — «Взять наличными», 2-й (не оплачено) — «… (не оплачено с 04.11)», после отметки — «Оплачено»');
// объединённые заказы одного клиента: 1-й день одного заказа + «хвост» другого
const merged = [mk('@both', 5, { firstDay: true, dayIds: [11], cashPending: true }), { ...mk('@both', 6, { firstDay: false, dayIds: [12], cashPending: true, cashSince: '2026-11-03' }), address: 'Street 5', lat: K.lat + 5 / 111, lng: K.lng + 3 / 107 }];
const mrp = buildRoutePlan(TODAY, planDay(merged, { lat: (d: any) => d.lat, lng: (d: any) => d.lng, address: (d: any) => d.address, qty: (d: any) => d.qty }, K, 1, DEFAULT_TRIP_SETTINGS), 1);
ok(/Взять наличными: 1 700 000 ₫ \(не оплачено с 03\.11\)/.test(strip(mrp.trips[0].stops[0].title)) && mrp.trips[0].stops.length === 1, 'объединённая точка: сумма обоих заказов, пометка по самой ранней дате (не оплачено с 03.11)');

console.log('\n── данные дня (day-plan): первый день отмечен / не отмечен ──');
{
  const { loadDayPlan } = await import(`${R}/day-plan.ts`);
  const mkRow = (id: number, o: any) => ({ id, qty: 1, delivered: false, courier_marked_at: null, orders: { id: `o${id}`, order_number: `NF-${id}`, type: 'subscription', status: 'confirmed', telegram: `@d${id}`, phone: null, address: 'A', place_id: null, lat: 16.05, lng: 108.22, hotel: null, comment: null, payment_method: 'cash', total: 850000, cutlery: false, lang: 'ru', ...o.order } });
  const days = (...xs: [string, boolean][]) => xs.map(([d, v]) => ({ delivery_date: d, delivered: v }));
  const rows = [
    mkRow(1, { order: { order_days: days([TODAY, false], ['2026-11-06', false]) } }),             // сегодня первый день
    mkRow(2, { order: { order_days: days(['2026-11-04', false], [TODAY, false]) } }),             // первый (04.11) не отмечен
    mkRow(3, { order: { order_days: days(['2026-11-04', true], [TODAY, false]) } }),              // первый отмечен
    mkRow(4, { order: { payment_method: 'qr', order_days: days(['2026-11-04', false], [TODAY, false]) } }),
  ];
  const p = await loadDayPlan({ from: (n: string) => ({ select: () => ({ in: () => Promise.resolve({ data: [] }), eq: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }) }) }) }, TODAY, rows);
  const [d1, d2, d3, d4] = p.deliveries;
  ok(d1.cashPending && d1.cashSince === null && d2.cashPending && d2.cashSince === '2026-11-04' && !d3.cashPending && d3.cashSince === null && !d4.cashPending, 'cashPending/cashSince считаются по отметке «Доставлено» первого дня заказа (наличные); QR — нет');
}

console.log('\n── напоминание в Orders (17:00) ──');
const od = (n: number, o: any, day = TODAY, order: any = {}) => store.order_days.push({ id: n, delivery_date: day, delivered: false, courier_marked_at: null, ...o, orders: { order_number: `NF-${1070 + n}`, telegram: `@c${n}`, total: 850000, status: 'confirmed', payment_method: 'cash', order_days: [{ delivery_date: day, delivered: false }, { delivery_date: '2026-11-06', delivered: false }], ...order } });
od(1, {});                                                                // 1-й день, не закрыт → в списке
od(2, { courier_marked_at: '2026-11-05T06:42:00Z' });                     // курьер отметил 13:42, админ не закрыл → в списке с пометкой
od(3, { delivered: true });                                               // сегодня закрыт → нет
od(4, {}, TODAY, { order_days: [{ delivery_date: '2026-11-04', delivered: false }, { delivery_date: TODAY, delivered: false }] }); // 2-й день, первый НЕ отмечен → в списке «не оплачено с 04.11»
od(8, {}, TODAY, { order_days: [{ delivery_date: '2026-11-04', delivered: true }, { delivery_date: TODAY, delivered: false }] });  // 2-й день, первый отмечен → нет
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
ok(r1.ok && r1.count === 3 && r1.total === 2550000 && msg.chat_id === '-100', 'в Orders уходит напоминание: 3 точки, 2 550 000 ₫');
ok(/Не закрыты наличные за Чт, 05\.11/.test(msg.text) && /@c1 · NF-1071 — 850 000 ₫ · не отмечено/.test(msg.text) && /@c2 · NF-1072 — 850 000 ₫ · 🚴 курьер отметил 13:42/.test(msg.text) && /@c4 · NF-1074 — 850 000 ₫ \(не оплачено с 04\.11\) · не отмечено/.test(msg.text), 'список: ник, заказ, сумма, «(не оплачено с 04.11)», «не отмечено» / «🚴 курьер отметил 13:42»');
ok(!/NF-1073|NF-1075|NF-1076|NF-1077|NF-1078/.test(msg.text), 'закрытые, первый день отмечен, QR, неподтверждённые и другие дни не попадают');
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
