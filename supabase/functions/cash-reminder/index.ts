import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsFor } from '../_shared/cors.ts';
import { buildCashReminder, loadUnclosedCash } from '../_shared/cash-reminder.ts';
import { isSunday, todayISO } from '../_shared/dates.ts';
import { safeEqual } from '../_shared/security.ts';
import { tg } from '../_shared/telegram.ts';
import { errMsg } from '../_shared/redact.ts';

/**
 * Ежедневно в 17:00 (Дананг, pg_cron) — напоминание в группу Orders о незакрытых СЕГОДНЯ точках с наличными (первый день наличного заказа, не отмечен «Доставлено»).
 * Нет таких точек — ничего не отправляется; воскресенье — пропуск. Доступ: x-cron-secret = CRON_SECRET ИЛИ JWT админа (viewer — forbidden). Тело (необязательно): {date}.
 */
Deno.serve(async (req) => {
  const cors = { ...corsFor(req.headers.get('origin')), 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-cron-secret' };
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json({ ok: false, code: 'bad_request' }, 405);

  let allowed = await safeEqual(req.headers.get('x-cron-secret') ?? '', Deno.env.get('CRON_SECRET') ?? '');
  if (!allowed) {
    const anon = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('authorization') ?? '' } }, auth: { persistSession: false } });
    const { data, error } = await anon.rpc('is_admin');
    allowed = !error && data === true;
  }
  if (!allowed) return json({ ok: false, code: 'forbidden' }, 403);

  let date = todayISO();
  try {
    const b = await req.json();
    if (typeof b?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.date)) date = b.date;
  } catch { /* без тела — сегодня */ }
  if (isSunday(date)) return json({ ok: true, skipped: 'sunday' });

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  let list;
  try {
    list = await loadUnclosedCash(db, date);
  } catch (e) {
    console.error('cash-reminder query failed:', errMsg(e));
    return json({ ok: false, code: 'server_error' }, 500);
  }
  if (!list.length) return json({ ok: true, count: 0 });
  const r = await tg('sendMessage', {
    chat_id: Deno.env.get('ORDERS_CHAT_ID')!,
    text: buildCashReminder(date, list),
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    reply_markup: { inline_keyboard: [[{ text: '✏️ Открыть в админке', url: `https://ninifoodvn.com/admin?tab=courier&date=${date}` }]] },
  });
  if (!r.ok) {
    console.error('cash-reminder telegram failed:', r.description);
    return json({ ok: false, code: 'telegram_failed' }, 502);
  }
  return json({ ok: true, count: list.length, total: list.reduce((s, x) => s + x.total, 0) });
});
