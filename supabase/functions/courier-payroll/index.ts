import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsFor } from '../_shared/cors.ts';
import { buildPayrollReport, weekDays } from '../_shared/courier-pay.ts';
import { addDays, todayISO } from '../_shared/dates.ts';
import { loadPayroll } from '../_shared/payroll.ts';
import { safeEqual } from '../_shared/security.ts';
import { tg } from '../_shared/telegram.ts';
import { errMsg } from '../_shared/redact.ts';

const mondayOf = (iso: string) => {
  const dow = new Date(`${iso}T00:00:00Z`).getUTCDay(); // 0 = вс
  return addDays(iso, -((dow + 6) % 7));
};

/**
 * Недельный отчёт по ЗП курьера в группу Orders (cron: воскресенье 09:00 по Дананг-времени). Тело: {action:'weekly', date?}.
 * По умолчанию — неделя Пн–Сб, закончившаяся накануне ближайшего воскресенья (для воскресенья — только что закончившаяся).
 * Доступ: заголовок x-cron-secret = CRON_SECRET (pg_cron) ИЛИ JWT админа; viewer и остальные — forbidden.
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
  const monday = mondayOf(addDays(date, -1)); // неделя, закончившаяся накануне (для воскресенья — Пн–Сб до него)
  const dates = weekDays(monday);
  const saturday = dates[5];

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  let p;
  try {
    p = await loadPayroll(db, dates);
  } catch (e) {
    console.error('courier-payroll load failed:', errMsg(e));
    return json({ ok: false, code: 'server_error' }, 500);
  }
  if (!p) return json({ ok: false, code: 'kitchen_missing' }, 409);
  if (!p.days.length) return json({ ok: true, skipped: 'no_deliveries', week: monday });

  const { text, total } = buildPayrollReport(monday, saturday, p.days, p.pay);
  if (total <= 0) return json({ ok: true, skipped: 'already_paid', week: monday });

  const { data: existing } = await db.from('courier_payouts').select('id, status').eq('week_start', monday).maybeSingle();
  if (existing?.status === 'paid' && !p.days.some((d) => !d.paid)) return json({ ok: true, skipped: 'already_paid', week: monday });
  const { data: row, error } = await db
    .from('courier_payouts')
    .upsert({ week_start: monday, week_end: saturday, amount: total, status: 'pending', report_text: text }, { onConflict: 'week_start' })
    .select('id')
    .single();
  if (error || !row) {
    console.error('courier-payroll upsert failed:', error?.message);
    return json({ ok: false, code: 'server_error' }, 500);
  }

  const adminUrl = `https://ninifoodvn.com/admin?tab=courier&date=${monday}`;
  const r = await tg('sendMessage', {
    chat_id: Deno.env.get('ORDERS_CHAT_ID')!,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    reply_markup: { inline_keyboard: [[{ text: '✅ Одобрить', callback_data: `p:ok:${row.id}` }, { text: '✏️ Открыть в админке', url: adminUrl }]] },
  });
  if (!r.ok) {
    console.error('courier-payroll telegram failed:', r.description);
    return json({ ok: false, code: 'telegram_failed' }, 502);
  }
  await db.from('courier_payouts').update({ report_message_id: r.result?.message_id ?? null }).eq('id', row.id);
  return json({ ok: true, week: monday, amount: total, payout_id: row.id });
});
