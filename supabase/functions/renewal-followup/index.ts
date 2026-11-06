import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsFor } from '../_shared/cors.ts';
import { todayISO } from '../_shared/dates.ts';
import { followupMessage, selectFollowups, type ClientOrder, type SentReminder } from '../_shared/renewal.ts';
import { safeEqual } from '../_shared/security.ts';
import { esc, tg } from '../_shared/telegram.ts';

/**
 * Ежедневно в 13:00 (Дананг, pg_cron): повторное «весёлое» напоминание в группу «NiniFood Renewals» (секрет RENEWALS_CHAT_ID) — клиентам, которым 2 дня назад ушло напоминание
 * о продлении или «после первого разового» (таблица renewal_sent), если они с тех пор не сделали ни одного заказа (по нику/телефону/аккаунту; отменённые не считаются).
 * Один раз на каждое напоминание (followup_at). Одно сообщение на клиента, обычный текст, без превью ссылок. Никого нет — ничего не отправляется.
 * Доступ: x-cron-secret = CRON_SECRET (pg_cron) ИЛИ JWT админа; остальные (в т.ч. viewer) — forbidden. Тело (необязательно): {date}.
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

  let today = todayISO();
  try {
    const b = await req.json();
    if (typeof b?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.date)) today = b.date;
  } catch { /* без тела — сегодня */ }

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const fail = (code: string, status: number) => json({ ok: false, code }, status);

  const since = new Date(Date.now() - 10 * 86_400_000).toISOString();
  const { data: sent, error: e1 } = await db.from('renewal_sent').select('id, kind, nick, phone, customer_id, order_number, sent_at, followup_at').is('followup_at', null).gte('sent_at', since);
  if (e1) {
    console.error('renewal-followup query failed:', e1.message);
    return fail('server_error', 500);
  }
  if (!(sent ?? []).length) return json({ ok: true, count: 0, skipped: 0 });
  const { data: ords, error: e2 } = await db.from('orders').select('telegram, phone, customer_id, created_at, lang, status').gte('created_at', new Date(Date.now() - 400 * 86_400_000).toISOString()).limit(5000);
  if (e2) {
    console.error('renewal-followup orders failed:', e2.message);
    return fail('server_error', 500);
  }
  const todo = selectFollowups(today, sent as SentReminder[], (ords ?? []) as ClientOrder[]);

  const chat = Deno.env.get('RENEWALS_CHAT_ID') ?? '';
  const toSend = todo.filter((f) => !f.skip);
  if (toSend.length && !chat) {
    try {
      await tg('sendMessage', { chat_id: Deno.env.get('ORDERS_CHAT_ID')!, text: '⚠️ Повторные напоминания не отправлены: не задан RENEWALS_CHAT_ID.', parse_mode: 'HTML' });
    } catch { /* без паники */ }
    return fail('chat_missing', 409);
  }
  let count = 0;
  for (const f of todo) {
    if (!f.skip) {
      const r = await tg('sendMessage', { chat_id: chat, text: followupMessage(f), parse_mode: 'HTML', disable_web_page_preview: true });
      if (!r.ok) {
        console.error('renewal-followup telegram failed:', r.description);
        try {
          await tg('sendMessage', { chat_id: Deno.env.get('ORDERS_CHAT_ID')!, text: `⚠️ Не удалось отправить повторные напоминания (${esc(String(r.description ?? 'ошибка Telegram'))}). Если группа стала супергруппой, обновите RENEWALS_CHAT_ID.`, parse_mode: 'HTML' });
        } catch { /* без паники */ }
        return fail('telegram_failed', 502);
      }
      count++;
    }
    await db.from('renewal_sent').update({ followup_at: new Date().toISOString(), followup_status: f.skip ? 'skipped' : 'sent' }).eq('id', f.reminder.id);
  }
  return json({ ok: true, count, skipped: todo.length - count });
});
