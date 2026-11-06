import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsFor } from '../_shared/cors.ts';
import { publishRoute, purgeObsolete, refreshKeyboards, syncRoute } from '../_shared/courier-route.ts';
import { addDays, isSunday, todayISO } from '../_shared/dates.ts';
import { safeEqual } from '../_shared/security.ts';
import { esc, tg } from '../_shared/telegram.ts';

/**
 * Маршрут дня в группе курьера (COURIER_CHAT_ID). Тело: { action: 'sync' | 'publish' | 'republish', date? }.
 * purge — удалить из группы все сообщения «❌ Неактуально» за дату (актуальные не трогает);
 * refresh — перерисовать кнопки уже опубликованных точек (на дату и следующий день) после смены набора кнопок;
 * sync — сверка уже опубликованного маршрута с планом (cron каждые 3 минуты; без опубликованного маршрута ничего не делает);
 * publish — опубликовать, если ещё нет; republish — «❌ Неактуально» на старые сообщения и отправка заново (кнопка в админке, с подтверждением).
 * Доступ: x-cron-secret = CRON_SECRET (pg_cron) ИЛИ JWT админа; viewer и остальные — forbidden.
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

  let action: 'sync' | 'publish' | 'republish' | 'refresh' | 'purge' = 'sync';
  let date = todayISO();
  try {
    const b = await req.json();
    if (b?.action === 'publish' || b?.action === 'republish' || b?.action === 'sync' || b?.action === 'refresh' || b?.action === 'purge') action = b.action;
    if (typeof b?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.date)) date = b.date;
  } catch { /* по умолчанию — сверка на сегодня */ }
  if (action !== 'refresh' && action !== 'purge' && isSunday(date)) return json({ ok: true, skipped: 'sunday' });

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const warn = async (text: string) => {
    await tg('sendMessage', { chat_id: Deno.env.get('ORDERS_CHAT_ID')!, text: `⚠️ ${text}`, parse_mode: 'HTML' });
  };
  try {
    if (action === 'sync') return json(await syncRoute(db, date));
    if (action === 'purge') return json({ ok: true, ...(await purgeObsolete(db, [date])) }); // удалить из группы все «❌ Неактуально» за дату
    if (action === 'refresh') return json({ ok: true, ...(await refreshKeyboards(db, [date, addDays(date, 1)])) }); // кнопки опубликованных точек на дату и следующий день
    const r = await publishRoute(db, date, action, warn);
    return json(r, r.ok ? 200 : 409);
  } catch (e) {
    console.error('courier-route failed:', (e as Error).message);
    await warn(`Маршрут курьера (${esc(date)}): ошибка. Проверьте группу и повторите «Отправить маршрут курьеру».`).catch(() => {});
    return json({ ok: false, code: 'server_error' }, 500);
  }
});
