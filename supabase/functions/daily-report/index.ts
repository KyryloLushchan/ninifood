import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsFor } from '../_shared/cors.ts';
import { buildCourierReport, type ReportDelivery } from '../_shared/courier-report.ts';
import { buildKitchenMessage } from '../_shared/kitchen-report.ts';
import { isSunday, todayISO } from '../_shared/dates.ts';
import { safeEqual } from '../_shared/security.ts';
import { esc, tg } from '../_shared/telegram.ts';

const FROM = '13:00';
const TO = '16:00';
/** Запас порций сверх заказов (повар готовит заказанное + это количество). Постоянная, не настройка. */
const EXTRA_PORTIONS = 2;

/**
 * Два сообщения: (1) курьеру в группу Orders, (2) порции для кухни в группу NiNi Ops (KITCHEN_CHAT_ID). Тело запроса `parts`: 'courier' | 'kitchen' (по умолчанию — оба, как у cron).
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
  let allowed = await safeEqual(given, secret);
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
  let couriersOverride: 1 | 2 | null = null;
  let parts: 'courier' | 'kitchen' | 'both' = 'both';
  try {
    const body = await req.json();
    if (typeof body?.date === 'string') date = body.date;
    if (body?.couriers === 1 || body?.couriers === 2) couriersOverride = body.couriers;
    if (body?.parts === 'courier' || body?.parts === 'kitchen') parts = body.parts;
  } catch { /* без тела — сегодня, число курьеров из настроек */ }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ ok: false, code: 'bad_request' }, 400);
  if (isSunday(date)) return json({ ok: true, skipped: 'sunday' });

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const ordersChat = Deno.env.get('ORDERS_CHAT_ID')!;
  const warnOrders = async (text: string) => {
    try {
      await tg('sendMessage', { chat_id: ordersChat, text: `⚠️ ${text}`, parse_mode: 'HTML' });
    } catch (e) {
      console.error('warnOrders failed:', (e as Error).message);
    }
  };

  // Порции для кухни: order_days.qty на дату по заказам new + confirmed + delivered (отменённые не считаются).
  // Снимок на момент вызова (в 00:00 по Дананг-времени). Ошибка Telegram (например, группа стала супергруппой и chat_id сменился) — в группу Orders.
  const sendKitchen = async () => {
    const { data, error } = await db
      .from('order_days')
      .select('qty, orders!inner(status, cutlery)')
      .eq('delivery_date', date)
      .in('orders.status', ['new', 'confirmed', 'delivered']);
    if (error) {
      console.error('daily-report kitchen query failed:', error.message);
      await warnOrders(`Не удалось посчитать порции для NiniFood Ops на ${esc(date)}.`);
      return { ok: false as const, code: 'server_error' };
    }
    let portions = 0;
    let cutlery = 0;
    for (const r of (data ?? []) as any[]) {
      portions += Number(r.qty) || 0;
      if (r.orders?.cutlery === true) cutlery += 1;
    }
    const kitchenChat = Deno.env.get('KITCHEN_CHAT_ID') ?? '';
    if (!kitchenChat) {
      await warnOrders('Порции для NiniFood Ops не отправлены: не задан KITCHEN_CHAT_ID.');
      return { ok: false as const, code: 'kitchen_chat_missing' };
    }
    const res = await tg('sendMessage', { chat_id: kitchenChat, text: buildKitchenMessage(date, portions, EXTRA_PORTIONS, cutlery), parse_mode: 'HTML', disable_web_page_preview: true });
    if (!res.ok) {
      console.error(`daily-report kitchen telegram failed for ${date}:`, res.description);
      await warnOrders(`Не удалось отправить порции в NiniFood Ops (${esc(String(res.description ?? 'ошибка Telegram'))}). Если группа стала супергруппой, обновите KITCHEN_CHAT_ID.`);
      return { ok: false as const, code: 'telegram_failed' };
    }
    return { ok: true as const, portions, extra: EXTRA_PORTIONS, total: portions + EXTRA_PORTIONS, cutlery };
  };

  const sendCourier = async () => {
    const { data, error } = await db
      .from('order_days')
      .select('qty, orders!inner(id, order_number, type, status, telegram, phone, address, place_id, lat, lng, hotel, comment, payment_method, total, cutlery, order_days(delivery_date))')
      .eq('delivery_date', date)
      .eq('orders.status', 'confirmed');
    if (error) {
      console.error('daily-report query failed:', error.message);
      return { ok: false as const, code: 'server_error' };
    }

    const deliveries: ReportDelivery[] = (data ?? []).map((r: any) => {
      const o = r.orders;
      const all: string[] = [...o.order_days].map((d: any) => d.delivery_date).sort();
      const first = all[0];
      return {
        order_number: o.order_number,
        telegram: o.telegram,
        phone: o.phone,
        address: o.address,
        place_id: o.place_id,
        lat: o.lat,
        lng: o.lng,
        hotel: o.hotel,
        comment: o.comment,
        payment_method: o.payment_method,
        total: o.total,
        cutlery: o.cutlery === true,
        qty: r.qty,
        sub: o.type === 'subscription' ? { total: all.length, dayNo: all.indexOf(date) + 1 } : null,
        firstDay: first === date,
      };
    });

    // Кухня и число курьеров по умолчанию — из settings (число на день можно передать в запросе из админки).
    const { data: st } = await db.from('settings').select('key, value').in('key', ['kitchen_lat', 'kitchen_lng', 'couriers_count']);
    const cfg = Object.fromEntries((st ?? []).map((r: any) => [r.key, r.value]));
    const klat = Number(cfg.kitchen_lat);
    const klng = Number(cfg.kitchen_lng);
    const kitchen = cfg.kitchen_lat && cfg.kitchen_lng && Number.isFinite(klat) && Number.isFinite(klng) ? { lat: klat, lng: klng } : null;
    const couriers: 1 | 2 = couriersOverride ?? (cfg.couriers_count === '2' ? 2 : 1);

    const chat_id = Deno.env.get('ORDERS_CHAT_ID')!;
    const texts = buildCourierReport(date, deliveries, FROM, TO, { kitchen, couriers });
    for (const text of texts) {
      const r = await tg('sendMessage', { chat_id, text, parse_mode: 'HTML', disable_web_page_preview: true });
      if (!r.ok) {
        console.error(`daily-report telegram failed for ${date}:`, r.description);
        return { ok: false as const, code: 'telegram_failed' };
      }
    }
    return { ok: true as const, addresses: deliveries.length, couriers, messages: texts.length };
  };

  const courier = parts === 'kitchen' ? null : await sendCourier();
  const kitchenRes = parts === 'courier' ? null : await sendKitchen();
  const failed = (courier && !courier.ok) || (kitchenRes && !kitchenRes.ok);
  if (failed) return json({ ok: false, code: 'telegram_failed', courier, kitchen: kitchenRes }, 502);
  return json({ ok: true, date, ...(courier ?? {}), kitchen: kitchenRes });
});
