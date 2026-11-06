// Повторное напоминание (renewal-followup) на заглушках: без БД и Telegram.
//   node --experimental-strip-types tools/renewal-check/followup.mts
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'followup-'));
let fails = 0;
const ok = (c: boolean, msg: string) => { if (!c) { fails++; console.log('  ❌', msg); } else console.log('  ✅', msg); };

const store: Record<string, any[]> = { renewal_sent: [], orders: [] };
const get = (r: any, p: string) => p.split('.').reduce((o, k) => o?.[k], r);
function from(name: string) {
  const filters: ((r: any) => boolean)[] = [];
  let mode: 'select' | 'update' = 'select';
  let payload: any = null;
  const run = () => {
    const t = store[name] ?? (store[name] = []);
    const hit = t.filter((r) => filters.every((f) => f(r)));
    if (mode === 'update') { hit.forEach((h) => Object.assign(h, payload)); return Promise.resolve({ data: hit, error: null }); }
    return Promise.resolve({ data: hit, error: null });
  };
  const q: any = {
    select: () => q, update: (p: any) => ((mode = 'update'), (payload = p), q), limit: () => q,
    eq: (c: string, v: any) => (filters.push((r) => get(r, c) === v), q),
    is: (c: string, v: any) => (filters.push((r) => (get(r, c) ?? null) === v), q),
    gte: (c: string, v: any) => (filters.push((r) => get(r, c) >= v), q),
    then: (a: any, b: any) => run().then(a, b),
  };
  return q;
}
(globalThis as any).__client = { from, rpc: async () => ({ data: false, error: null }) };
fs.writeFileSync(path.join(tmp, 'stub-supabase.mts'), 'export function createClient() { return (globalThis as any).__client; }\n');
const tgCalls: { method: string; body: any }[] = [];
(globalThis as any).fetch = async (url: string, init: any) => {
  const m = /api\.telegram\.org\/bot[^/]*\/(\w+)/.exec(String(url));
  if (!m) throw new Error('внешний запрос запрещён в проверке: ' + url);
  tgCalls.push({ method: m[1], body: JSON.parse(init.body) });
  return { json: async () => ({ ok: true, result: { message_id: 1 } }) };
};
const env: Record<string, string> = { CRON_SECRET: 'cron', RENEWALS_CHAT_ID: '-300', ORDERS_CHAT_ID: '-100', TELEGRAM_BOT_TOKEN: 'x', SUPABASE_URL: 'u', SUPABASE_ANON_KEY: 'a', SUPABASE_SERVICE_ROLE_KEY: 's' };
let handler: any;
(globalThis as any).Deno = { env: { get: (k: string) => env[k] }, serve: (h: any) => { handler = h; } };
let s = fs.readFileSync(path.join(ROOT, 'supabase/functions/renewal-followup/index.ts'), 'utf8');
s = s.replace("'npm:@supabase/supabase-js@2'", `'${path.join(tmp, 'stub-supabase.mts')}'`).replace(/'\.\.\/_shared\/([\w-]+)\.ts'/g, `'${ROOT}/supabase/functions/_shared/$1.ts'`);
const f = path.join(tmp, 'fn.mts');
fs.writeFileSync(f, s);
await import(f);
const run = (date: string, secret = 'cron') => handler(new Request('http://x', { method: 'POST', headers: { 'content-type': 'application/json', 'x-cron-secret': secret }, body: JSON.stringify({ date }) })).then((r: Response) => r.json());
const sentAt = new Date(Date.now() - 36 * 3600_000).toISOString(); // относительное время не важно: даты задаём явно ниже
const rem = (id: number, kind: string, nick: string, order: string, at: string, extra: any = {}) => store.renewal_sent.push({ id, kind, nick, phone: null, customer_id: null, order_number: order, sent_at: at, followup_at: null, followup_status: null, ...extra });
const ord = (telegram: string, created_at: string, lang: string | null, status = 'confirmed', extra: any = {}) => store.orders.push({ telegram, phone: null, customer_id: null, created_at, lang, status, ...extra });
const RECENT = new Date().toISOString(); // чтобы запрос «за последние 10 дней» видел запись
const day = (iso: string) => new Date(`${iso}T13:00:00Z`).toISOString(); // 20:00 Дананга

// Текущая дата берётся из запроса; sent_at = «06.11 20:00 Дананг» = 13:00 UTC
const SENT = '2026-11-06T13:00:00.000Z';
const origNow = Date.now;
Date.now = () => new Date('2026-11-08T06:00:00Z').getTime(); // 08.11 13:00 Дананг

console.log('── сценарии (08.11 13:00, напоминания от 06.11 20:00) ──');
rem(1, 'renewal', 'anna_ru', 'NF-1001', SENT); ord('@anna_ru', '2026-11-01T05:00:00Z', 'ru');
rem(2, 'first_single', 'olya_ua', 'NF-1002', SENT); ord('@Olya_UA', '2026-11-05T05:00:00Z', 'ua');
rem(3, 'renewal', 'john_en', 'NF-1003', SENT); ord('john_en', '2026-11-02T05:00:00Z', 'en'); ord('@john_en', '2026-11-07T03:00:00Z', 'en'); // заказал после напоминания
rem(4, 'first_single', 'lan_vi', 'NF-1004', SENT); ord('lan_vi', '2026-11-05T05:00:00Z', 'vi'); ord('lan_vi', '2026-11-07T03:00:00Z', 'vi', 'cancelled'); // отменённый не считается
rem(5, 'renewal', 'late_guy', 'NF-1005', '2026-11-07T13:00:00.000Z'); ord('late_guy', '2026-11-01T05:00:00Z', 'ru'); // ещё рано (07.11 → 09.11)
rem(6, 'renewal', 'byphone', 'NF-1006', SENT, { phone: '+84901234567' }); ord('other_nick', '2026-11-01T05:00:00Z', 'ru', 'confirmed', { phone: '+84901234567' }); ord('x', '2026-11-07T04:00:00Z', 'ru', 'new', { phone: '+84901234567' }); // тот же телефон, заказал
rem(7, 'first_single', 'anna_ru', 'NF-1007', SENT); // второе напоминание того же клиента — повторное одно
// дата отправки в записях должна попасть в окно «последние 10 дней» от Date.now()
const r1 = await run('2026-11-08');
const msgs = tgCalls.filter((c) => c.method === 'sendMessage').map((c) => c.body);
ok(r1.ok && r1.count === 3, `отправлено 3 (anna_ru ru, olya_ua ua, lan_vi vi); ответ: ${JSON.stringify(r1)}`);
const by = (n: string) => msgs.find((m) => m.text.includes(n));
ok(msgs.every((m) => m.chat_id === '-300' && m.parse_mode === 'HTML' && m.disable_web_page_preview === true), 'в группу Renewals, без превью ссылок');
ok(!by('john_en') && !by('byphone'), 'заказал за 2 дня (по нику / по телефону) — не шлём');
ok(!!by('NF-1001') && !by('NF-1007'), 'у одного клиента два напоминания — одно повторное');
const a = by('anna_ru')!.text, o = by('olya_ua')!.text, l = by('lan_vi')!.text;
ok(a.startsWith('😋 Повторное · @anna_ru · NF-1001 (после продления 06.11)\n\nГолодны? 😋🍲'), 'RU: первая строка и текст');
ok(a.includes('👉 https://ninifoodvn.com/?lang=ru\n\nЗагляните в отзывы наших гостей 💬⭐ https://t.me/+5WmNqxOYJuJhOWU6'), 'RU: ссылка и группа отзывов');
ok(o.startsWith('😋 Повторное · @olya_ua · NF-1002 (после первого разового 06.11)\n\nГолодні?') && o.includes('?lang=uk') && o.includes('Зазирніть у відгуки'), 'UA: первая строка, ?lang=uk, текст');
ok(l.includes('Đói bụng chưa?') && l.includes('?lang=vi') && l.includes('Xem đánh giá'), 'VI: текст и ?lang=vi (заказ-отмена не считается)');
const rowOf = (id: number) => store.renewal_sent.find((r) => r.id === id);
ok(rowOf(1).followup_status === 'sent' && rowOf(3).followup_status === 'skipped' && rowOf(5).followup_at === null, 'отмечено: отправлено / пропущено; «ещё рано» не тронуто');

console.log('\n── повторный запуск и другие языки ──');
tgCalls.length = 0;
const r2 = await run('2026-11-08');
ok(r2.ok && r2.count === 0 && tgCalls.length === 0, 'повторный запуск в тот же день — ничего не шлём');
rem(8, 'renewal', 'sam_en', 'NF-1008', SENT); ord('sam_en', '2026-11-01T05:00:00Z', 'en');
const r3 = await run('2026-11-08');
const en = tgCalls.find((c) => c.method === 'sendMessage')!.body.text;
ok(r3.count === 1 && en.includes('Hungry? 😋🍲') && en.includes('?lang=en') && en.includes('Check out what our guests say'), 'EN: текст и ?lang=en');
tgCalls.length = 0;
rem(9, 'renewal', 'late_guy', 'NF-1005', SENT); // старая запись догоняется до +2 дней, дальше — нет
const r4 = await run('2026-11-12');
ok(r4.count === 0 && tgCalls.length === 0, 'запись старше окна догона (срок 08.11, сегодня 12.11) — не шлём');
tgCalls.length = 0;
const r5 = await run('2026-11-09');
ok(r5.count === 1 && tgCalls[0].body.text.includes("NF-1005"), 'запись от 07.11 наступает 09.11');
tgCalls.length = 0;
store.renewal_sent.length = 0; // никого — не отправлять
const r6 = await run('2026-11-08');
ok(r6.ok && r6.count === 0 && tgCalls.length === 0, 'никого нет — ничего не отправляется');
const bad = await handler(new Request('http://x', { method: 'POST', headers: { 'x-cron-secret': 'no' }, body: '{}' }));
ok(bad.status === 403 || bad.status === 500, 'без секрета cron доступа нет');
Date.now = origNow;
console.log(fails ? `\nПРОВАЛ: ${fails}` : '\nВсё ок');
process.exit(fails ? 1 : 0);
