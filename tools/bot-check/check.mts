// /start в личке бота (Mini App) — на заглушках: без БД и Telegram.
//   node --experimental-strip-types tools/bot-check/check.mts
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bot-'));
let fails = 0;
const ok = (c: boolean, msg: string) => { if (!c) { fails++; console.log('  ❌', msg); } else console.log('  ✅', msg); };

const store: Record<string, any[]> = { bot_users: [], settings: [], orders: [], courier_route_msgs: [], order_days: [] };
const get = (r: any, p: string) => p.split('.').reduce((o, k) => o?.[k], r);
function from(name: string) {
  const filters: ((r: any) => boolean)[] = [];
  let mode: 'select' | 'upsert' | 'insert' = 'select';
  let up: any = null;
  const run = (single: boolean) => {
    const t = store[name] ?? (store[name] = []);
    if (mode === 'upsert') {
      const k = up.onConflict;
      let r = t.find((x) => x[k] === up.obj[k]);
      if (r) Object.assign(r, up.obj); else t.push((r = { ...up.obj }));
      return Promise.resolve({ data: r, error: null });
    }
    if (mode === 'insert') { t.push({ ...up.obj }); return Promise.resolve({ data: null, error: null }); }
    const hit = t.filter((r) => filters.every((f) => f(r)));
    return Promise.resolve({ data: single ? (hit[0] ?? null) : hit, error: null });
  };
  const q: any = { select: () => q, eq: (c: string, v: any) => (filters.push((r) => get(r, c) === v), q), in: (c: string, vs: any[]) => (filters.push((r) => vs.includes(get(r, c))), q), upsert: (obj: any, o: any) => ((mode = 'upsert'), (up = { obj, onConflict: o.onConflict }), q), insert: (obj: any) => ((mode = 'insert'), (up = { obj }), q), maybeSingle: () => run(true), single: () => run(true), then: (a: any, b: any) => run(false).then(a, b) };
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
const env: Record<string, string> = { CRON_SECRET: 'cron', ORDERS_CHAT_ID: '-100', COURIER_CHAT_ID: '-555', TG_WEBHOOK_SECRET: 'wh', ADMIN_TG_IDS: '11', TELEGRAM_BOT_TOKEN: 'x', SUPABASE_URL: 'u', SUPABASE_ANON_KEY: 'a', SUPABASE_SERVICE_ROLE_KEY: 's' };
let handler: any;
(globalThis as any).Deno = { env: { get: (k: string) => env[k] }, serve: (h: any) => { handler = h; } };
let s = fs.readFileSync(path.join(ROOT, 'supabase/functions/tg-webhook/index.ts'), 'utf8');
s = s.replace("'npm:@supabase/supabase-js@2'", `'${path.join(tmp, 'stub-supabase.mts')}'`).replace(/'\.\.\/_shared\/([\w-]+)\.ts'/g, `'${ROOT}/supabase/functions/_shared/$1.ts'`);
const f = path.join(tmp, 'tg-webhook.mts');
fs.writeFileSync(f, s);
await import(f);
const send = (update: any, secret = 'wh') => handler(new Request('http://x', { method: 'POST', headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': secret }, body: JSON.stringify(update) }));
const start = (from: any, text = '/start', chatType = 'private') => send({ message: { message_id: 1, text, chat: { id: from.id, type: chatType }, from } });
const last = () => tgCalls.filter((c) => c.method === 'sendMessage').pop()?.body;

console.log('── /start: язык, текст, кнопка ──');
const cases: [string, string, string, string][] = [
  ['ru', 'Анна', 'Привет, Анна! 👋 Это NiniFood — домашние обеды с доставкой в Дананге 🍲 Нажмите кнопку ниже, чтобы посмотреть меню и заказать 👇', 'ru'],
  ['uk', 'Оля', 'Привіт, Оля! 👋 Це NiniFood — домашні обіди з доставкою в Дананзі 🍲 Натисніть кнопку нижче, щоб переглянути меню та замовити 👇', 'uk'],
  ['en', 'John', 'Hi, John! 👋 This is NiniFood — home-cooked lunches delivered in Da Nang 🍲 Tap the button below to see the menu and order 👇', 'en'],
  ['vi', 'Lan', 'Xin chào, Lan! 👋 Đây là NiniFood — bữa trưa nhà làm giao tận nơi ở Đà Nẵng 🍲 Nhấn nút bên dưới để xem thực đơn và đặt món 👇', 'vi'],
  ['de', 'Hans', 'Hi, Hans! 👋 This is NiniFood — home-cooked lunches delivered in Da Nang 🍲 Tap the button below to see the menu and order 👇', 'en'],
];
let id = 1000;
for (const [code, name, text, lang] of cases) {
  tgCalls.length = 0;
  await start({ id: ++id, first_name: name, username: `u${id}`, language_code: code });
  const m = last()!;
  ok(m.chat_id === id && m.text === text && m.reply_markup.inline_keyboard[0][0].text === '🍽 Открыть меню' && m.reply_markup.inline_keyboard[0][0].web_app.url === `https://ninifoodvn.com/?lang=${lang}`, `language_code «${code}» → ответ на ${lang}, кнопка web_app → ?lang=${lang}`);
}
tgCalls.length = 0;
await start({ id: 2001, first_name: 'Pt', language_code: 'pt-BR' });
ok(/^Hi, Pt!/.test(last()!.text), 'pt-BR (неизвестный) → en');
tgCalls.length = 0;
await start({ id: 2002, language_code: 'ru', username: 'nofirst' });
ok(/^Привет, @nofirst!/.test(last()!.text), 'нет имени — подставляется @ник');
tgCalls.length = 0;
await start({ id: 2003, first_name: 'Max', language_code: 'en' }, '/start payload123');
ok(/^Hi, Max!/.test(last()!.text), '«/start payload» тоже обрабатывается');
tgCalls.length = 0;
await start({ id: 2004, first_name: 'Max', language_code: 'en' }, '/start@nini_food_bot');
ok(/^Hi, Max!/.test(last()!.text), '«/start@бот» тоже обрабатывается');

console.log('\n── только личные чаты ──');
tgCalls.length = 0;
await start({ id: 3001, first_name: 'G', language_code: 'ru' }, '/start', 'group');
await start({ id: 3002, first_name: 'G', language_code: 'ru' }, '/start', 'supergroup');
ok(tgCalls.length === 0 && !store.bot_users.some((u) => u.user_id === 3001 || u.user_id === 3002), '/start в группе/супергруппе игнорируется: ответа нет, в bot_users не пишется');
await start({ id: 3003, first_name: 'T', language_code: 'ru' }, 'привет');
await start({ id: 3004, first_name: 'T', language_code: 'ru' }, '/help');
ok(tgCalls.length === 0, 'любой другой текст в личке (не /start) — тишина');
await start({ id: 3005, is_bot: true, first_name: 'Bot', language_code: 'ru' });
ok(tgCalls.length === 0, 'сообщения от ботов игнорируются');
const bad: Response = await send({ message: { text: '/start', chat: { id: 1, type: 'private' }, from: { id: 1, first_name: 'X' } } }, 'wrong');
ok(bad.status === 401 && tgCalls.length === 0, 'неверный секрет вебхука — 401, ничего не отправлено');

console.log('\n── bot_users ──');
const u = store.bot_users.find((x) => x.user_id === 1001)!;
ok(!!u && u.username === 'u1001' && u.first_name === 'Анна' && u.language_code === 'ru' && u.starts === 1 && !!u.first_start_at, 'записан: user id, ник, имя, язык, дата, число запусков');
const first = u.first_start_at;
await start({ id: 1001, first_name: 'Анна', username: 'u1001', language_code: 'ru' });
ok(store.bot_users.filter((x) => x.user_id === 1001).length === 1 && u.starts === 2 && u.first_start_at === first, 'повторный /start: та же строка, starts = 2, первая дата сохраняется');

console.log('\n── прежнее поведение tg-webhook не сломано ──');
tgCalls.length = 0;
await send({ callback_query: { id: 'q1', from: { id: 999 }, data: 'c:NF-1', message: { chat: { id: -100 }, message_id: 5 } } });
ok(tgCalls.some((c) => c.method === 'answerCallbackQuery' && c.body.text === 'Нет доступа'), 'кнопка заказа от чужого id: «Нет доступа» (как раньше)');
tgCalls.length = 0;
await send({ callback_query: { id: 'q2', from: { id: 999 }, data: 'd:1', message: { chat: { id: -555 }, message_id: 5 } } });
ok(tgCalls.some((c) => c.method === 'answerCallbackQuery' && c.body.text === 'Нет прав'), 'кнопка группы курьера от чужого id: «Нет прав» (как раньше)');
tgCalls.length = 0;
await send({ message: { message_id: 7, text: 'просто сообщение в группе', chat: { id: -555, type: 'group' }, from: { id: 5, first_name: 'A' }, reply_to_message: { message_id: 3 } } });
ok(tgCalls.length === 0, 'ответ в группе курьера не на вопрос бота — игнорируется (как раньше)');
console.log(fails ? `\n❌ ПРОВАЛОВ: ${fails}` : '\n✅ все проверки /start пройдены');
fs.rmSync(tmp, { recursive: true, force: true });
