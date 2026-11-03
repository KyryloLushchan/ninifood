// Проверка напоминаний о продлении подписки на заглушках: без БД, без Telegram, без Cloudflare, без Google.
//   node --experimental-strip-types tools/renewal-check/check.mts
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'renewal-'));
let fails = 0;
const ok = (c: boolean, msg: string) => { if (!c) { fails++; console.log('  ❌', msg); } else console.log('  ✅', msg); };

// ── заглушки БД / Telegram / Turnstile ──
const store: Record<string, any[]> = { orders: [], order_days: [], renewal_links: [], renewal_attempts: [], settings: [], order_attempts: [], security_alerts: [], customers: [], viewers: [], vip_customers: [], customer_discounts: [], order_drafts: [] };
let seq = 0;
const get = (r: any, p: string) => p.split('.').reduce((o, k) => o?.[k], r);
function join(name: string, r: any, cols: string) {
  const o: any = { ...r };
  if (/orders!inner/.test(cols) && r.order_id) o.orders = store.orders.find((x) => x.id === r.order_id);
  if (/order_days\(/.test(cols) && name === 'orders') o.order_days = store.order_days.filter((d) => d.order_id === r.id);
  return o;
}
function from(name: string) {
  const filters: ((r: any) => boolean)[] = [];
  let mode: 'select' | 'insert' | 'update' | 'delete' = 'select';
  let payload: any = null, cols = '*', head = false, wantCount = false;
  const run = (single: boolean) => {
    const t = store[name] ?? (store[name] = []);
    if (mode === 'insert') {
      const rows = (Array.isArray(payload) ? payload : [payload]).map((p) => { const r = { id: p.id ?? `id${++seq}`, created_at: new Date().toISOString(), ...(name === 'renewal_links' ? { expires_at: new Date(Date.now() + 7 * 86400000).toISOString(), used_at: null } : {}), ...p }; if (name === 'orders') r.order_number = `NF-${9000 + ++seq}`; t.push(r); return r; });
      return Promise.resolve({ data: single ? rows[0] : rows, error: null });
    }
    const hit = t.map((r) => join(name, r, cols)).filter((r) => filters.every((f) => f(r)));
    if (mode === 'update') { hit.forEach((h) => { const real = t.find((x) => x.id === h.id && (x.code === undefined || x.code === h.code)) ?? t.find((x) => x === h); Object.assign(real ?? h, payload); }); return Promise.resolve({ data: hit, error: null }); }
    if (mode === 'delete') { for (const h of hit) { const i = t.findIndex((x) => x.id === h.id); if (i >= 0) t.splice(i, 1); } return Promise.resolve({ data: hit, error: null }); }
    if (wantCount && head) return Promise.resolve({ data: null, count: hit.length, error: null });
    return Promise.resolve({ data: single ? (hit[0] ?? null) : hit, count: hit.length, error: null });
  };
  const q: any = {
    select: (c = '*', o: any = {}) => { cols = c; head = !!o.head; wantCount = o.count === 'exact'; return q; },
    insert: (p: any) => ((mode = 'insert'), (payload = p), q), update: (p: any) => ((mode = 'update'), (payload = p), q), delete: () => ((mode = 'delete'), q),
    eq: (c: string, v: any) => (filters.push((r) => get(r, c) === v), q), neq: (c: string, v: any) => (filters.push((r) => get(r, c) !== v), q),
    in: (c: string, vs: any[]) => (filters.push((r) => vs.includes(get(r, c))), q),
    gt: (c: string, v: any) => (filters.push((r) => get(r, c) > v), q), gte: (c: string, v: any) => (filters.push((r) => get(r, c) >= v), q), lt: (c: string, v: any) => (filters.push((r) => get(r, c) < v), q),
    is: (c: string, v: any) => (filters.push((r) => (v === null ? get(r, c) == null : get(r, c) === v)), q), or: () => q, limit: () => q,
    maybeSingle: () => run(true), single: () => run(true), then: (a: any, b: any) => run(false).then(a, b),
  };
  return q;
}
let isAdmin = false;
const client: any = { from, rpc: async (fn: string) => ({ data: fn === 'is_admin' ? isAdmin : null, error: null }), auth: { getUser: async () => ({ data: { user: null } }) } };
(globalThis as any).__client = client;
fs.writeFileSync(path.join(tmp, 'stub-supabase.mts'), 'export function createClient() { return (globalThis as any).__client; }\n');

const tgCalls: { method: string; body: any }[] = [];
let msgId = 900;
(globalThis as any).fetch = async (url: string, init: any) => {
  const u = String(url);
  if (/challenges\.cloudflare\.com/.test(u)) return { json: async () => ({ success: true }) };
  const m = /api\.telegram\.org\/bot[^/]*\/(\w+)/.exec(u);
  if (!m) throw new Error('внешний запрос запрещён в проверке: ' + u);
  const body = init.body instanceof FormData ? Object.fromEntries((init.body as FormData).entries()) : JSON.parse(init.body);
  tgCalls.push({ method: m[1], body });
  return { json: async () => ({ ok: true, result: { message_id: ++msgId, photo: [{ file_id: 'f' }] } }) };
};
const env: Record<string, string> = { CRON_SECRET: 'cron', ORDERS_CHAT_ID: '-100', RENEWALS_CHAT_ID: '-555', TELEGRAM_BOT_TOKEN: 'x', SUPABASE_URL: 'u', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 's', TURNSTILE_SECRET: 't', IP_HASH_SALT: 'salt' };
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
const { addDays, todayISO, isSunday } = await import(`${ROOT}/supabase/functions/_shared/dates.ts`);
const { selectEntries, clientText, nickText, renewalLink } = await import(`${ROOT}/supabase/functions/_shared/renewal.ts`);
const TODAY = todayISO();
const D = (n: number) => addDays(TODAY, n);

// ── данные ──
let oid = 0;
const mkOrder = (num: number, tg: string, o: any = {}) => {
  const id = `o${++oid}`;
  store.orders.push({ id, order_number: `NF-${num}`, type: 'subscription', status: 'confirmed', telegram: tg, phone: o.phone ?? `+8490000${String(num).padStart(4, '0')}`, customer_id: o.customer_id ?? null, qty: 1, address: `Address of ${tg}`, hotel: o.hotel ?? null, comment: o.comment ?? null, place_id: null, lat: null, lng: null, cutlery: !!o.cutlery, lang: 'ru', ...o.fields });
  for (const d of o.days ?? [-4, -3, -2, -1, 0]) store.order_days.push({ id: `d${++seq}`, order_id: id, delivery_date: D(d), qty: o.dayQty ?? 1 });
  return id;
};
mkOrder(1, '@alice', { phone: '+84326477671', hotel: 'Hotel Sun', comment: 'этаж 7', fields: { lang: 'ua' } });                       // заканчивается сегодня → в списке
mkOrder(2, '@bob'); mkOrder(3, '@bob', { fields: { status: 'new' }, days: [1, 2, 3, 4, 5] });                   // уже есть следующая (неподтверждённая) → нет
mkOrder(4, '@carol', { phone: '+84911111111' }); mkOrder(5, '@someone_else', { fields: { type: 'single' }, phone: '+84911111111', days: [2] }); // тот же телефон → нет
mkOrder(6, '@dave', { customer_id: 'cust-1' }); mkOrder(7, '@dave2', { customer_id: 'cust-1', days: [3] });     // тот же аккаунт → нет
mkOrder(8, '@erin', { fields: { lang: 'en' } }); mkOrder(9, '@erin', { fields: { status: 'cancelled' }, days: [1, 2, 3, 4, 5] });          // будущая отменена → в списке
mkOrder(10, '@frank', { days: [-5, -4, -3, -2, -1] });                                                         // закончилась вчера → нет
mkOrder(11, '@gina', { days: [-2, -1, 0, 1, 2] });                                                             // заканчивается позже → нет
mkOrder(12, '@hank', { fields: { status: 'delivered', lang: 'vi' } });                                                     // доставлена (все дни) → в списке
mkOrder(13, '@ivan', { fields: { type: 'single' }, days: [0] });                                               // разовый → нет
mkOrder(14, '@jane', { fields: { status: 'new' } });                                                           // не подтверждена → нет
mkOrder(15, '@kim', { dayQty: 1 }); mkOrder(16, '@kim', { dayQty: 1 });                                        // два заказа одного клиента → одна запись
for (const k of ['price_single', 'price_subscription', 'delivery_single']) store.settings.push({ key: k, value: k === 'price_single' ? '170000' : k === 'price_subscription' ? '750000' : '20000' });

console.log('\n── отбор клиентов (чистая логика) ──');
const ending = store.orders.filter((o) => o.type === 'subscription' && ['confirmed', 'delivered'].includes(o.status)).map((o) => { const ds = store.order_days.filter((d) => d.order_id === o.id).map((d) => d.delivery_date).sort(); return { id: o.id, order_number: o.order_number, telegram: o.telegram, phone: o.phone, customer_id: o.customer_id, daysCount: ds.length, lastDay: ds[ds.length - 1], lastQty: 1 }; });
const future = store.order_days.filter((d) => d.delivery_date > TODAY).map((d) => store.orders.find((o) => o.id === d.order_id)).filter((o) => ['new', 'confirmed', 'delivered'].includes(o.status)).map((o) => ({ telegram: o.telegram, phone: o.phone, customer_id: o.customer_id }));
const entries = selectEntries(TODAY, ending, future);
console.log('   в списке:', entries.map((e: any) => `${e.nick} (${e.orders.join('+')})`).join(', '));
ok(entries.map((e: any) => e.nick).join(',') === '@alice,@erin,@hank,@kim', 'в списке ровно alice, erin (будущая отменена), hank (доставлена), kim');
ok(entries.find((e: any) => e.nick === '@kim')?.orders.join('+') === 'NF-15+NF-16' && entries.find((e: any) => e.nick === '@kim')?.portions === 2, 'два заказа одного клиента — одна запись (NF-15 + NF-16, 2 порц.)');
ok(!entries.some((e: any) => ['@bob', '@carol', '@dave', '@frank', '@gina', '@ivan', '@jane'].includes(e.nick)), 'нет: следующий заказ (по нику / телефону / аккаунту), закончилась вчера, заканчивается позже, разовый, неподтверждённая');

console.log('\n── ежедневная функция ──');
const reminder = await load('renewal-reminder');
const post = (h: Record<string, string> = {}, body: any = {}) => reminder(new Request('http://x', { method: 'POST', headers: { 'content-type': 'application/json', ...h }, body: JSON.stringify(body) }));
isAdmin = false;
let r = await post();
ok(r.status === 403 && tgCalls.length === 0 && store.renewal_links.length === 0, 'без секрета / не админ (viewer): 403, ничего не отправлено и не создано');
r = await post({ 'x-cron-secret': 'cron' });
const b1: any = await r.json();
ok(b1.ok && b1.count === 4, `отправлено, клиентов: ${b1.count}`);
const sent = tgCalls.filter((c) => c.method === 'sendMessage').map((c) => c.body);
ok(sent.length === 4 && sent.every((m) => m.chat_id === '-555'), `4 отдельных сообщения (по одному на клиента) в группу Renewals: ${sent.length}`);
for (const m of sent) console.log(m.text.split('\n').map((l: string) => '    ' + l).join('\n') + '\n');
const alice = sent.find((m) => m.text.includes('@alice'))!;
ok(alice.text.split('\n')[0] === '🔔 @alice · NF-1 — 5 дн., 1 порц.', 'формат: 🔔 @ник · NF-… — N дн., M порц.');
ok(alice.text === `🔔 @alice · NF-1 — 5 дн., 1 порц.\n\n${clientText('ua')}` && !/<code>|🔗/.test(alice.text), 'обычный текст: сводка, пустая строка, текст клиенту; без <code> и без строки «🔗 ninifoodvn.com»');
ok(sent.every((m) => m.disable_web_page_preview === true), 'превью ссылки выключено');
const linkOf = (nick: string) => sent.find((m) => m.text.includes(nick))!.text.split('\n').pop();
ok(linkOf('@alice') === 'https://ninifoodvn.com/?lang=uk#subscription', 'язык заказа ua → ?lang=uk');
ok(linkOf('erin') === 'https://ninifoodvn.com/?lang=en#subscription' && linkOf('hank') === 'https://ninifoodvn.com/?lang=vi#subscription' && linkOf('kim') === 'https://ninifoodvn.com/?lang=ru#subscription', 'en → ?lang=en, vi → ?lang=vi, ru → ?lang=ru');
ok(renewalLink(null) === 'https://ninifoodvn.com/?lang=ru#subscription' && renewalLink('xx') === 'https://ninifoodvn.com/?lang=ru#subscription', 'нет языка у заказа → ru');
ok(clientText('ru') === 'Привет! Спасибо, что были с нами эту неделю 💛 Сегодня последний день вашей подписки NiniFood.\nНе оставайтесь без домашнего обеда — продлите подписку 👇\nhttps://ninifoodvn.com/?lang=ru#subscription', 'текст совпадает с ТЗ посимвольно (ссылка с ?lang=)');
ok(sent.every((m) => !/\?r=|📞|\+84|Заканчиваются/.test(m.text)) && store.renewal_links.length === 0, 'нет телефона, нет ссылок ?r=, ссылки в БД не создаются');
const kim = sent.find((m) => m.text.includes('kim'))!;
ok(kim.text.startsWith('🔔 kim · NF-15 + NF-16 — 5 дн., 2 порц.'), 'два заказа одного клиента — одно сообщение');
// пустой день → ничего не отправляем
store.order_days.length = 0; store.orders.length = 0;
const n0 = tgCalls.length;
r = await post({ 'x-cron-secret': 'cron' });
ok((await r.json()).count === 0 && tgCalls.length === n0, 'никого нет — сообщение не отправляется');
// RENEWALS_CHAT_ID не задан → предупреждение в Orders
mkOrder(30, '@zed'); delete env.RENEWALS_CHAT_ID;
r = await post({ 'x-cron-secret': 'cron' });
const w = tgCalls.pop()!;
ok(r.status === 409 && w.body.chat_id === '-100' && /RENEWALS_CHAT_ID/.test(w.body.text), 'нет RENEWALS_CHAT_ID: предупреждение в Orders, клиентам ничего');
env.RENEWALS_CHAT_ID = '-555';

console.log('\n── данные по коду (order-draft renewal_get) ──');
const draft = await load('order-draft');
const dpost = (body: any, ip = '1.1.1.1') => draft(new Request('http://x', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip, 'x-forwarded-for': ip }, body: JSON.stringify(body) }));
store.orders.length = 0; store.order_days.length = 0; store.renewal_links.length = 0; store.renewal_attempts.length = 0;
const src = mkOrder(40, '@alice', { phone: '+84326477671', hotel: 'Hotel Sun', comment: 'этаж 7', cutlery: true, fields: { lat: 16.05, lng: 108.22, place_id: 'PID' } });
const good = 'A'.repeat(22);
store.renewal_links.push({ code: good, order_id: src, portions: 2, created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 86400000).toISOString(), used_at: null });
store.renewal_links.push({ code: 'B'.repeat(22), order_id: src, portions: 1, created_at: new Date().toISOString(), expires_at: new Date(Date.now() - 1000).toISOString(), used_at: null });
store.renewal_links.push({ code: 'C'.repeat(22), order_id: src, portions: 1, created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 86400000).toISOString(), used_at: new Date().toISOString() });
let rr = await dpost({ action: 'renewal_get', code: good });
let body: any = await rr.json();
ok(rr.status === 200 && body.ok && body.renewal.telegram === '@alice' && body.renewal.portions === 2 && body.renewal.address === 'Address of @alice' && body.renewal.hotel === 'Hotel Sun' && body.renewal.comment === 'этаж 7' && body.renewal.cutlery === true, 'верный код: Telegram, адрес, отель, комментарий, порции, приборы');
ok(body.renewal.phone_hint === '32 *** 71' && !JSON.stringify(body).includes('326477671') && !JSON.stringify(body).includes('84326'), 'телефон только в маске «32 *** 71» (+84 32 *** 71), полного номера в ответе нет');
for (const [label, c] of [['просроченный', 'B'.repeat(22)], ['использованный', 'C'.repeat(22)], ['неверный', 'Z'.repeat(22)], ['битый формат', 'xx']] as const) {
  rr = await dpost({ action: 'renewal_get', code: c });
  ok(rr.status === 404, `${label} код → not_found (сайт откроется как обычно)`);
}
store.renewal_attempts.length = 0;
for (let i = 0; i < 20; i++) await dpost({ action: 'renewal_get', code: 'Q'.repeat(21) + String(i % 10) }, '9.9.9.9');
rr = await dpost({ action: 'renewal_get', code: good }, '9.9.9.9');
ok(rr.status === 429, 'перебор: после 20 неудачных попыток с одного IP даже верный код → 429');
rr = await dpost({ action: 'renewal_get', code: good }, '8.8.8.8');
ok(rr.status === 200, 'другой IP не затронут');

console.log('\n── заказ по коду (send-order) ──');
const sendOrder = await load('send-order');
const days: string[] = []; for (let i = 1; days.length < 5; i++) if (!isSunday(D(i))) days.push(D(i));
const send = async (payload: any) => {
  const fd = new FormData();
  fd.set('payload', JSON.stringify({ type: 'sub', days, portions: 2, payment: 'cash', telegram: '@alice', address: 'New address 12', captcha: 'tok', lang: 'ru', ...payload }));
  return sendOrder(new Request('http://x', { method: 'POST', headers: { authorization: 'Bearer anon', apikey: 'anon', 'cf-connecting-ip': '5.5.5.5' }, body: fd }));
};
const lin = () => store.renewal_links.find((l) => l.code === good)!;
let sr = await send({ renewal: good });
let sb: any = await sr.json();
const created = store.orders.find((o) => o.order_number === sb.orderNumber);
ok(sr.status === 200 && sb.ok && created?.phone === '+84326477671', `заказ без телефона в форме + код: сервер подставил полный номер из прошлого заказа (${created?.phone})`);
ok(created?.type === 'subscription' && created?.address === 'New address 12', 'тип «Подписка», изменённый клиентом адрес сохранён');
ok(!!lin().used_at && lin().used_order_id === created?.id, 'после оформления ссылка погашена (одноразовая)');
rr = await dpost({ action: 'renewal_get', code: good }, '3.3.3.3');
ok(rr.status === 404, 'погашенная ссылка больше не отдаёт данные');
sr = await send({ renewal: good });
sb = await sr.json();
ok(sr.status === 400 && sb.code === 'phone_invalid', 'повторный заказ по погашенному коду без телефона: phone_invalid (номер не подставляется)');
// клиент поменял телефон
store.renewal_links.push({ code: 'D'.repeat(22), order_id: src, portions: 1, created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 86400000).toISOString(), used_at: null });
sr = await send({ renewal: 'D'.repeat(22), phone: '+84977000111' });
sb = await sr.json();
ok(sb.ok && store.orders.find((o) => o.order_number === sb.orderNumber)?.phone === '+84977000111', 'клиент изменил телефон — уходит новый номер');
// подмена: чужой код с фиктивным кодом не даёт номера
sr = await send({ renewal: 'E'.repeat(22) });
sb = await sr.json();
ok(sr.status === 400 && sb.code === 'phone_invalid', 'неизвестный код: телефон не подставляется');
console.log(fails ? `\n❌ ПРОВАЛОВ: ${fails}` : '\n✅ все проверки напоминаний о продлении пройдены');
fs.rmSync(tmp, { recursive: true, force: true });
