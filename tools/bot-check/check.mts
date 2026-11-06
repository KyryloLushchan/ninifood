// Бот молчит в личке и в чужих группах — на заглушках: без БД и Telegram.
//   node --experimental-strip-types tools/bot-check/check.mts
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bot-'));
let fails = 0;
const ok = (c: boolean, msg: string) => { if (!c) { fails++; console.log('  ❌', msg); } else console.log('  ✅', msg); };

const store: Record<string, any[]> = { settings: [], orders: [], courier_route_msgs: [], order_days: [] };
const writes: string[] = [];
const get = (r: any, p: string) => p.split('.').reduce((o, k) => o?.[k], r);
function from(name: string) {
  const filters: ((r: any) => boolean)[] = [];
  let mode: 'select' | 'upsert' | 'insert' | 'update' | 'delete' = 'select';
  let up: any = null;
  const run = (single: boolean) => {
    const t = store[name] ?? (store[name] = []);
    if (mode === 'upsert') {
      writes.push(`upsert ${name}`);
      let r = t.find((x) => x[up.onConflict] === up.obj[up.onConflict]);
      if (r) Object.assign(r, up.obj); else t.push((r = { ...up.obj }));
      return Promise.resolve({ data: r, error: null });
    }
    if (mode !== 'select') { writes.push(`${mode} ${name}`); return Promise.resolve({ data: null, error: null }); }
    const hit = t.filter((r) => filters.every((f) => f(r)));
    return Promise.resolve({ data: single ? (hit[0] ?? null) : hit, error: null });
  };
  const q: any = { select: () => q, eq: (c: string, v: any) => (filters.push((r) => get(r, c) === v), q), in: (c: string, vs: any[]) => (filters.push((r) => vs.includes(get(r, c))), q), upsert: (obj: any, o: any) => ((mode = 'upsert'), (up = { obj, onConflict: o.onConflict }), q), insert: () => ((mode = 'insert'), q), update: () => ((mode = 'update'), q), delete: () => ((mode = 'delete'), q), maybeSingle: () => run(true), single: () => run(true), then: (a: any, b: any) => run(false).then(a, b) };
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
const env: Record<string, string> = { CRON_SECRET: 'cron', ORDERS_CHAT_ID: '-100', KITCHEN_CHAT_ID: '-200', COURIER_CHAT_ID: '-555', RENEWALS_CHAT_ID: '-300', TG_WEBHOOK_SECRET: 'wh', ADMIN_TG_IDS: '11', TELEGRAM_BOT_TOKEN: 'x', SUPABASE_URL: 'u', SUPABASE_ANON_KEY: 'a', SUPABASE_SERVICE_ROLE_KEY: 's' };
let handler: any;
(globalThis as any).Deno = { env: { get: (k: string) => env[k] }, serve: (h: any) => { handler = h; } };
let s = fs.readFileSync(path.join(ROOT, 'supabase/functions/tg-webhook/index.ts'), 'utf8');
s = s.replace("'npm:@supabase/supabase-js@2'", `'${path.join(tmp, 'stub-supabase.mts')}'`).replace(/'\.\.\/_shared\/([\w-]+)\.ts'/g, `'${ROOT}/supabase/functions/_shared/$1.ts'`);
const f = path.join(tmp, 'tg-webhook.mts');
fs.writeFileSync(f, s);
await import(f);
const send = (update: any, secret = 'wh') => handler(new Request('http://x', { method: 'POST', headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': secret }, body: JSON.stringify(update) }));
const reset = () => { tgCalls.length = 0; writes.length = 0; };

console.log('── личные чаты: полная тишина ──');
for (const text of ['/start', '/start abc', '/help', 'привет']) {
  reset();
  const r = await send({ message: { message_id: 1, text, chat: { id: 5001, type: 'private' }, from: { id: 5001, first_name: 'X', language_code: 'ru' } } });
  ok(r.status === 200 && tgCalls.length === 0 && writes.length === 0, `«${text}» в личке: нет ответа, нет записи в БД`);
}
reset();
await send({ callback_query: { id: 'c', data: 'c:abc', from: { id: 11 }, message: { message_id: 1, chat: { id: 11, type: 'private' } } } });
ok(tgCalls.length === 0, 'кнопка из личного чата — игнорируется (даже от админа)');
reset();
await send({ my_chat_member: { chat: { id: 5002, type: 'private' }, new_chat_member: { status: 'member' } } });
ok(tgCalls.length === 0, 'my_chat_member в личке — тишина');

console.log('\n── чужие группы: выход ──');
for (const type of ['group', 'supergroup', 'channel']) {
  reset();
  await send({ my_chat_member: { chat: { id: -9001, type, title: 'Чужая' }, new_chat_member: { status: 'member' } } });
  ok(tgCalls.length === 1 && tgCalls[0].method === 'leaveChat' && tgCalls[0].body.chat_id === -9001 && writes.length === 0, `бота добавили в чужой ${type} → leaveChat, больше ничего`);
}
reset();
await send({ message: { message_id: 1, text: 'hi', chat: { id: -9002, type: 'supergroup' }, from: { id: 11 } } });
ok(tgCalls.length === 1 && tgCalls[0].method === 'leaveChat', 'сообщение из чужой группы → leaveChat');
reset();
await send({ callback_query: { id: 'c', data: 'c:abc', from: { id: 11 }, message: { message_id: 1, chat: { id: -9003, type: 'supergroup' } } } });
ok(tgCalls.every((c) => c.method === 'leaveChat') && writes.length === 0, 'кнопка заказа в чужой группе (даже от админа) — не выполняется, выход');

console.log('\n── свои группы остаются ──');
for (const id of ['-100', '-200', '-555', '-300']) {
  reset();
  await send({ my_chat_member: { chat: { id: Number(id), type: 'supergroup' }, new_chat_member: { status: 'administrator' } } });
  ok(tgCalls.length === 0, `изменение членства в нашей группе ${id} — без выхода и действий`);
  reset();
  await send({ message: { message_id: 1, text: 'hello', chat: { id: Number(id), type: 'supergroup' }, from: { id: 99 } } });
  ok(!tgCalls.some((c) => c.method === 'leaveChat'), `обычное сообщение в нашей группе ${id} — не выходим`);
}

console.log('\n── миграция своей группы в супергруппу ──');
reset();
await send({ message: { message_id: 1, migrate_from_chat_id: -555, chat: { id: -1009999, type: 'supergroup', title: 'NiniFood Courier' } } });
ok(!tgCalls.some((c) => c.method === 'leaveChat') && tgCalls.some((c) => c.method === 'sendMessage' && c.body.chat_id === '-100' && /супергруппой/.test(c.body.text)), 'migrate_from_chat_id нашей группы: не выходим, предупреждение в Orders');
reset();
await send({ message: { message_id: 2, text: 'hi', chat: { id: -1009999, type: 'supergroup' }, from: { id: 99 } } });
ok(!tgCalls.some((c) => c.method === 'leaveChat'), 'следующие сообщения в мигрировавшей группе — тоже без выхода');

console.log('\n── кнопки курьера только в группе курьера ──');
reset();
const r1 = await send({ callback_query: { id: 'c', data: 'd:5', from: { id: 11 }, message: { message_id: 1, chat: { id: -100, type: 'supergroup' } } } });
ok(r1.status === 200 && !tgCalls.some((c) => c.method === 'editMessageText') && writes.length === 0, 'd:<id> из группы Orders (не курьера) — ничего не меняется');

console.log('\n── секрет вебхука ──');
for (const sec of ['', 'bad', 'whx']) {
  reset();
  const r = await send({ message: { chat: { id: -9005, type: 'supergroup' } } }, sec);
  ok(r.status === 401 && tgCalls.length === 0, `секрет «${sec}» → 401, ничего не выполняется`);
}
console.log(fails ? `\nПРОВАЛ: ${fails}` : '\nВсё ок');
process.exit(fails ? 1 : 0);
