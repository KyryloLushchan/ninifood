import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsFor } from '../_shared/cors.ts';
import { clientIp, sha256hex, verifyTurnstile } from '../_shared/security.ts';
import { tg } from '../_shared/telegram.ts';

const FAIL_MAX = 5; // неудачных попыток входа/кода с одного IP или на один email
const FAIL_WINDOW_MIN = 15; // → пауза 15 минут
const RESET_PER_MIN = 1;
const RESET_PER_HOUR = 5;
const SIGNUP_PER_HOUR_IP = 5;
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 72;

type Kind = 'signin' | 'signup' | 'reset' | 'reset_confirm';

/**
 * Единственный путь входа/регистрации/сброса пароля для сайта и админки.
 * Регистрация в Supabase Auth закрыта (disable_signup): пользователей создаёт только эта функция (после Turnstile и лимитов).
 * POST {action: signin|signup|reset_request|reset_confirm, email, password?, token?, captcha}
 */
Deno.serve(async (req) => {
  const cors = corsFor(req.headers.get('origin'));
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json({ ok: false, code: 'bad_request' }, 405);

  let p: any;
  try {
    p = await req.json();
  } catch {
    return json({ ok: false, code: 'bad_request' }, 400);
  }
  const action = String(p?.action ?? '');
  const email = String(p?.email ?? '').trim().toLowerCase();
  const password = typeof p?.password === 'string' ? p.password : '';
  const captcha = typeof p?.captcha === 'string' ? p.captcha : '';
  if (!['signin', 'signup', 'reset_request', 'reset_confirm'].includes(action)) return json({ ok: false, code: 'bad_request' }, 400);
  if (email.length > 254 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ ok: false, code: 'email_invalid' }, 400);
  if (password.length > PASSWORD_MAX) return json({ ok: false, code: 'weak_password' }, 400);

  const url = Deno.env.get('SUPABASE_URL')!;
  const db = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const anon = () => createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { auth: { persistSession: false } });

  const ip = clientIp(req);
  const salt = Deno.env.get('IP_HASH_SALT') ?? '';
  const ipHash = ip ? await sha256hex(ip + salt) : null;
  const emailHash = await sha256hex(email + salt);
  const country = req.headers.get('cf-ipcountry');
  const since = (ms: number) => new Date(Date.now() - ms).toISOString();

  const log = async (kind: Kind, ok: boolean) => {
    const { error } = await db.from('auth_attempts').insert({ kind, ok, ip_hash: ipHash, email_hash: emailHash, country });
    if (error) console.error('auth_attempts insert failed:', error.message);
  };
  const count = async (col: 'ip_hash' | 'email_hash', val: string | null, kinds: Kind[], ok: boolean, ms: number) => {
    if (!val) return 0;
    const { count } = await db.from('auth_attempts').select('id', { count: 'exact', head: true }).eq(col, val).in('kind', kinds).eq('ok', ok).gte('created_at', since(ms));
    return count ?? 0;
  };

  // Пауза: 5 неудач (пароль / код сброса) с одного IP или на один email за 15 минут.
  const failKinds: Kind[] = ['signin', 'reset_confirm'];
  const [ipFails, emailFails] = await Promise.all([
    count('ip_hash', ipHash, failKinds, false, FAIL_WINDOW_MIN * 60_000),
    count('email_hash', emailHash, failKinds, false, FAIL_WINDOW_MIN * 60_000),
  ]);
  if (ipFails >= FAIL_MAX || emailFails >= FAIL_MAX) return json({ ok: false, code: 'locked' }, 429);

  if (!(await verifyTurnstile(captcha, ip))) return json({ ok: false, code: 'captcha_failed' }, 400);

  const sessionOf = (s: { access_token: string; refresh_token: string }) => ({ access_token: s.access_token, refresh_token: s.refresh_token });

  try {
    if (action === 'signin') {
      if (!password) return json({ ok: false, code: 'invalid_credentials' }, 401);
      const { data, error } = await anon().auth.signInWithPassword({ email, password });
      if (error || !data.session) {
        await log('signin', false);
        return json({ ok: false, code: 'invalid_credentials' }, 401);
      }
      await log('signin', true);
      const { data: adm } = await db.from('admins').select('user_id').eq('user_id', data.user.id).maybeSingle();
      if (adm) await notifyAdminLogin(country);
      return json({ ok: true, session: sessionOf(data.session) });
    }

    if (action === 'signup') {
      if (password.length < PASSWORD_MIN) return json({ ok: false, code: 'weak_password' }, 400);
      if ((await count('ip_hash', ipHash, ['signup'], true, 3600_000)) >= SIGNUP_PER_HOUR_IP) return json({ ok: false, code: 'rate_limited' }, 429);
      const created = await db.auth.admin.createUser({ email, password, email_confirm: true });
      if (created.error) {
        if (/already|registered|exists/i.test(created.error.message)) return json({ ok: false, code: 'email_exists' }, 409);
        if (/password/i.test(created.error.message)) return json({ ok: false, code: 'weak_password' }, 400);
        throw created.error;
      }
      await log('signup', true);
      const { data, error } = await anon().auth.signInWithPassword({ email, password });
      if (error || !data.session) throw error ?? new Error('no session');
      return json({ ok: true, session: sessionOf(data.session) });
    }

    if (action === 'reset_request') {
      // Письмо с кодом возможно только со своим SMTP и шаблоном {{ .Token }} (на встроенной почте Free-плана шаблон не меняется) — включается секретом MAIL_READY=1.
      if (Deno.env.get('MAIL_READY') !== '1') return json({ ok: false, code: 'reset_unavailable' }, 503);
      const [m, h, hip] = await Promise.all([
        count('email_hash', emailHash, ['reset'], true, 60_000),
        count('email_hash', emailHash, ['reset'], true, 3600_000),
        count('ip_hash', ipHash, ['reset'], true, 3600_000),
      ]);
      if (m >= RESET_PER_MIN || h >= RESET_PER_HOUR || hip >= RESET_PER_HOUR * 2) return json({ ok: false, code: 'reset_rate_limited' }, 429);
      await log('reset', true);
      const { error } = await anon().auth.resetPasswordForEmail(email);
      if (error) {
        console.error('resetPasswordForEmail failed:', error.status, error.message);
        return json({ ok: false, code: 'mail_failed' }, 502);
      }
      return json({ ok: true }); // существует ли такой email — не раскрываем
    }

    // reset_confirm: код из письма (6 цифр) + новый пароль
    const token = String(p?.token ?? '').trim();
    if (!/^\d{6}$/.test(token)) return json({ ok: false, code: 'code_invalid' }, 400);
    if (password.length < PASSWORD_MIN) return json({ ok: false, code: 'weak_password' }, 400);
    const { data, error } = await anon().auth.verifyOtp({ email, token, type: 'recovery' });
    if (error || !data.session || !data.user) {
      await log('reset_confirm', false);
      return json({ ok: false, code: 'code_invalid' }, 401);
    }
    const upd = await db.auth.admin.updateUserById(data.user.id, { password });
    if (upd.error) {
      if (/password/i.test(upd.error.message)) return json({ ok: false, code: 'weak_password' }, 400);
      throw upd.error;
    }
    await log('reset_confirm', true);
    const { data: adm } = await db.from('admins').select('user_id').eq('user_id', data.user.id).maybeSingle();
    if (adm) await notifyAdminLogin(country, 'сброс пароля');
    return json({ ok: true, session: sessionOf(data.session) });
  } catch (e) {
    console.error('auth-gate failed:', action, (e as Error).message);
    return json({ ok: false, code: 'server_error' }, 500);
  }
});

/** «⚠️ Вход в админку» в группу Orders: время по Дананг-времени и страна (если есть). Ошибка Telegram не мешает входу. */
async function notifyAdminLogin(country: string | null, how = 'вход по паролю') {
  try {
    const time = new Date().toLocaleString('ru-RU', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'medium' });
    const text = `⚠️ <b>Вход в админку</b> (${how})\n🕐 ${time} (Дананг)\n🌍 ${country && /^[A-Za-z]{2}$/.test(country) ? country.toUpperCase() : 'страна неизвестна'}`;
    const r = await tg('sendMessage', { chat_id: Deno.env.get('ORDERS_CHAT_ID')!, text, parse_mode: 'HTML' });
    if (!r.ok) console.error('admin login notify failed:', r.description);
  } catch (e) {
    console.error('admin login notify error:', (e as Error).message);
  }
}
