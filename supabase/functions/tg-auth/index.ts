import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsFor } from '../_shared/cors.ts';
import { safeEqual } from '../_shared/security.ts';

const MAX_AGE_S = 24 * 3600; // подпись Telegram старше суток не принимаем
const enc = new TextEncoder();
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');

/** Подпись Login Widget: HMAC-SHA256(data_check_string, SHA256(bot_token)); сравнение за константное время. */
async function validSignature(data: Record<string, string>, token: string): Promise<boolean> {
  const { hash, ...rest } = data;
  if (!hash || !token) return false;
  const check = Object.keys(rest).sort().map((k) => `${k}=${rest[k]}`).join('\n');
  const secret = await crypto.subtle.digest('SHA-256', enc.encode(token));
  const key = await crypto.subtle.importKey('raw', secret, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = hex(await crypto.subtle.sign('HMAC', key, enc.encode(check)));
  return safeEqual(hash.toLowerCase(), mac);
}

Deno.serve(async (req) => {
  const cors = corsFor(req.headers.get('origin'));
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json({ ok: false, code: 'bad_request' }, 405);

  let raw: any;
  try {
    raw = (await req.json())?.auth;
  } catch {
    return json({ ok: false, code: 'bad_request' }, 400);
  }
  if (!raw || typeof raw !== 'object' || Object.keys(raw).length > 12) return json({ ok: false, code: 'bad_request' }, 400);
  const data: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v !== 'string' && typeof v !== 'number') return json({ ok: false, code: 'bad_request' }, 400);
    data[k] = String(v);
  }

  if (!(await validSignature(data, Deno.env.get('TELEGRAM_BOT_TOKEN') ?? ''))) return json({ ok: false, code: 'auth_invalid' }, 401);
  const age = Math.floor(Date.now() / 1000) - Number(data.auth_date);
  if (!Number.isFinite(age) || age > MAX_AGE_S || age < -300) return json({ ok: false, code: 'auth_expired' }, 401);
  const tgId = Number(data.id);
  if (!Number.isSafeInteger(tgId) || tgId <= 0) return json({ ok: false, code: 'bad_request' }, 400);
  const username = /^[A-Za-z0-9_]{4,32}$/.test(data.username ?? '') ? data.username : null;

  const url = Deno.env.get('SUPABASE_URL')!;
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  try {
    // Пользователя создаём только здесь (регистрация в Auth закрыта). Email синтетический, пароля нет.
    const email = `tg${tgId}@telegram.ninifood.invalid`;
    const created = await admin.auth.admin.createUser({ email, email_confirm: true, app_metadata: { provider: 'telegram', telegram_id: tgId } });
    if (created.error && !/already|registered|exists/i.test(created.error.message)) throw created.error;

    // Сессию выдаём через magic link, подтверждённый на сервере: письмо не отправляется.
    const link = await admin.auth.admin.generateLink({ type: 'magiclink', email });
    if (link.error || !link.data.user) throw link.error ?? new Error('no user');
    const userId = link.data.user.id;
    if (Number(link.data.user.app_metadata?.telegram_id) !== tgId) throw new Error('user/telegram_id mismatch');
    const anon = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { auth: { persistSession: false } });
    const verified = await anon.auth.verifyOtp({ type: 'magiclink', token_hash: link.data.properties.hashed_token });
    if (verified.error || !verified.data.session) throw verified.error ?? new Error('no session');

    const { error: cErr } = await admin.from('customers').upsert({ user_id: userId, telegram_id: tgId, telegram_username: username }, { onConflict: 'user_id' });
    if (cErr) throw cErr;

    // Первый вход VIP-клиента: привязываем telegram_id к нику; дальше проверка только по id.
    if (username) {
      const { error } = await admin.from('vip_customers').update({ telegram_id: tgId }).eq('telegram_username', username.toLowerCase()).is('telegram_id', null);
      if (error) console.error('vip bind failed:', error.message);
    }

    const s = verified.data.session;
    return json({ ok: true, session: { access_token: s.access_token, refresh_token: s.refresh_token } });
  } catch (e) {
    console.error('tg-auth failed:', (e as Error).message);
    return json({ ok: false, code: 'server_error' }, 500);
  }
});
