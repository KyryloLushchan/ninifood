import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsFor } from '../_shared/cors.ts';
import { buildCourierReport, type ReportDelivery } from '../_shared/courier-report.ts';
import { isSunday, todayISO } from '../_shared/dates.ts';
import { tg } from '../_shared/telegram.ts';

const FROM = '14:00';
const TO = '16:00';

/**
 * Отчёт для курьера в группу Orders: confirmed-доставки на дату (по умолчанию сегодня по Дананг-времени).
 * Доступ: заголовок x-cron-secret = CRON_SECRET (pg_cron) ИЛИ JWT админа (кнопка в админке).
 * verify_jwt выключен, потому что cron не имеет JWT, — проверка здесь.
 */
Deno.serve(async (req) => {
  const cors = { ...corsFor(req.headers.get('origin')), 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-cron-secret' };
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json({ ok: false, code: 'bad_request' }, 405);

  const secret = Deno.env.get('CRON_SECRET') ?? '';
  const given = req.headers.get('x-cron-secret') ?? '';
  let allowed = secret.length > 0 && given === secret;
  if (!allowed) {
    const auth = req.headers.get('authorization') ?? '';
    const anon = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: auth } },
      auth: { persistSession: false },
    });
    const { data, error } = await anon.rpc('is_admin');
    allowed = !error && data === true;
  }
  if (!allowed) return json({ ok: false, code: 'forbidden' }, 403);

  let date = todayISO();
  try {
    const body = await req.json();
    if (typeof body?.date === 'string') date = body.date;
  } catch { /* без тела — сегодня */ }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ ok: false, code: 'bad_request' }, 400);
  if (isSunday(date)) return json({ ok: true, skipped: 'sunday' });

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const { data, error } = await db
    .from('order_days')
    .select('qty, orders!inner(id, order_number, type, status, telegram, address, place_id, lat, lng, hotel, comment, payment_method, total, order_days(delivery_date))')
    .eq('delivery_date', date)
    .eq('orders.status', 'confirmed');
  if (error) {
    console.error('daily-report query failed:', error.message);
    return json({ ok: false, code: 'server_error' }, 500);
  }

  const deliveries: ReportDelivery[] = (data ?? []).map((r: any) => {
    const o = r.orders;
    const all: string[] = [...o.order_days].map((d: any) => d.delivery_date).sort();
    const first = all[0];
    return {
      order_number: o.order_number,
      telegram: o.telegram,
      address: o.address,
      place_id: o.place_id,
      lat: o.lat,
      lng: o.lng,
      hotel: o.hotel,
      comment: o.comment,
      payment_method: o.payment_method,
      total: o.total,
      qty: r.qty,
      sub: o.type === 'subscription' ? { total: all.length, dayNo: all.indexOf(date) + 1 } : null,
      firstDay: first === date,
    };
  });

  const chat_id = Deno.env.get('ORDERS_CHAT_ID')!;
  const texts = buildCourierReport(date, deliveries, FROM, TO);
  for (const text of texts) {
    const r = await tg('sendMessage', { chat_id, text, parse_mode: 'HTML', disable_web_page_preview: true });
    if (!r.ok) {
      console.error(`daily-report telegram failed for ${date}:`, r.description);
      return json({ ok: false, code: 'telegram_failed' }, 502);
    }
  }
  return json({ ok: true, date, addresses: deliveries.length, messages: texts.length });
});
