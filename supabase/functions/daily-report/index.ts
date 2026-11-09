import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsFor } from '../_shared/cors.ts';
import { buildCourierReport } from '../_shared/courier-report.ts';
import { buildKitchenMessage, type KitchenTrip } from '../_shared/kitchen-report.ts';
import { publishRoute } from '../_shared/courier-route.ts';
import { loadDayPlan, loadDayRows } from '../_shared/day-plan.ts';
import { hhmm, planDay } from '../_shared/trips.ts';
import { isSunday, todayISO } from '../_shared/dates.ts';
import { safeEqual } from '../_shared/security.ts';
import { esc, tg } from '../_shared/telegram.ts';

/** Запас порций сверх заказов по умолчанию (повар готовит заказанное + это количество); настройка `extra_portions` (Настройки → Курьеры) важнее. */
const DEFAULT_EXTRA_PORTIONS = 2;

/**
 * Два сообщения: (1) курьеру в группу Orders, (2) порции для кухни в группу NiNi Ops (KITCHEN_CHAT_ID). Тело запроса `parts`: 'courier' | 'kitchen' (по умолчанию — оба, как у cron).
 * Отчёт для курьера в группу Orders: доставки на дату (по умолчанию сегодня по Дананг-времени) — подтверждённые и новые (⏳), рейсы по вместимости, ручное распределение дня (route_overrides). Порции кухне — по рейсам.
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
  const viaCron = await safeEqual(given, secret);
  let allowed = viaCron;
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

  // Один набор данных на дату для всех сообщений (`_shared/day-plan.ts`): заказы new (⏳) + confirmed + delivered. Снимок на момент вызова (в 00:00 по Дананг-времени).
  const loadDay = () => loadDayRows(db, date);
  const loadPlan = (rows: any[]) => loadDayPlan(db, date, rows, couriersOverride);

  const sendKitchen = async (rows: any[]) => {
    let portions = 0;
    let cutlery = 0;
    const seenOrders = new Set<string>();
    for (const r of rows) {
      portions += Number(r.qty) || 0;
      if (r.orders?.cutlery === true && !seenOrders.has(r.orders.id)) cutlery += 1;
      seenOrders.add(r.orders.id);
    }
    const { data: exs } = await db.from('settings').select('value').eq('key', 'extra_portions').maybeSingle();
    const exn = Number(String(exs?.value ?? '').trim());
    const EXTRA_PORTIONS = String(exs?.value ?? '').trim() !== '' && Number.isInteger(exn) && exn >= 0 && exn <= 50 ? exn : DEFAULT_EXTRA_PORTIONS;
    const kitchenChat = Deno.env.get('KITCHEN_CHAT_ID') ?? '';
    if (!kitchenChat) {
      await warnOrders('Порции для NiniFood Ops не отправлены: не задан KITCHEN_CHAT_ID.');
      return { ok: false as const, code: 'kitchen_chat_missing' };
    }
    // Порции по рейсам: тот же план, что у курьера (по подтверждённым + новым; новые — «⏳»).
    let trips: KitchenTrip[][] | undefined;
    let unplaced = 0;
    let offRouteQty = 0;
    try {
      const p = await loadPlan(rows);
      if (p.kitchen) {
        const plan = planDay(p.deliveries, { lat: (d) => d.lat, lng: (d) => d.lng, address: (d) => d.address, qty: (d) => d.qty, offRoute: (d) => d.offRoute === true }, p.kitchen, p.couriers, p.trip, p.override);
        trips = plan.couriers.map((c) => c.trips.map((t) => ({ portions: t.portions, pending: t.stops.reduce((n, s) => n + s.stop.items.filter((x) => x.status === 'new').reduce((a, x) => a + x.qty, 0), 0) })));
        unplaced = plan.noPoint.reduce((n, d) => n + d.qty, 0);
        offRouteQty = plan.offRoute.reduce((n, d) => n + d.qty, 0);
      }
    } catch (e) {
      console.error('daily-report kitchen trips failed:', (e as Error).message); // сообщение уйдёт без рейсов
    }
    // Заметки кухне на эту дату (kitchen_notes); ошибка чтения сообщение не ломает.
    const { data: nt, error: ntErr } = await db.from('kitchen_notes').select('text').eq('date', date).order('id');
    if (ntErr) console.error('daily-report kitchen notes failed:', ntErr.message);
    const notes = (nt ?? []).map((n: { text: string }) => String(n.text).trim()).filter(Boolean);
    const res = await tg('sendMessage', { chat_id: kitchenChat, text: buildKitchenMessage(date, portions, EXTRA_PORTIONS, cutlery, trips, unplaced, notes, offRouteQty), parse_mode: 'HTML', disable_web_page_preview: true });
    if (!res.ok) {
      console.error(`daily-report kitchen telegram failed for ${date}:`, res.description);
      await warnOrders(`Не удалось отправить порции в NiniFood Ops (${esc(String(res.description ?? 'ошибка Telegram'))}). Если группа стала супергруппой, обновите KITCHEN_CHAT_ID.`);
      return { ok: false as const, code: 'telegram_failed' };
    }
    return { ok: true as const, portions, extra: EXTRA_PORTIONS, total: portions + EXTRA_PORTIONS, cutlery };
  };

  const sendCourier = async (rows: any[]) => {
    const p = await loadPlan(rows);
    const chat_id = Deno.env.get('ORDERS_CHAT_ID')!;
    const texts = buildCourierReport(date, p.deliveries, p.trip.departMin ? hhmm(p.trip.departMin) : '13:00', hhmm(p.trip.deadlineMin), { kitchen: p.kitchen, couriers: p.couriers, trip: p.trip, override: p.override });
    for (const text of texts) {
      const r = await tg('sendMessage', { chat_id, text, parse_mode: 'HTML', disable_web_page_preview: true });
      if (!r.ok) {
        console.error(`daily-report telegram failed for ${date}:`, r.description);
        return { ok: false as const, code: 'telegram_failed' };
      }
    }
    return { ok: true as const, addresses: rows.length, couriers: p.couriers, messages: texts.length };
  };

  const day = await loadDay();
  if (day.error) {
    console.error('daily-report query failed:', day.error);
    if (parts !== 'courier') await warnOrders(`Не удалось посчитать порции для NiniFood Ops на ${esc(date)}.`);
    return json({ ok: false, code: 'server_error' }, 500);
  }
  const courier = parts === 'kitchen' ? null : await sendCourier(day.rows);
  const kitchenRes = parts === 'courier' ? null : await sendKitchen(day.rows);
  // Ночной запуск (cron, оба сообщения): сразу после отчёта — маршрут дня в группу курьера (точки с кнопкой «Доставлено»). Ручные кнопки админки маршрут не публикуют.
  let route: unknown = null;
  if (viaCron && parts === 'both' && courier?.ok) {
    try {
      route = await publishRoute(db, date, 'publish', warnOrders);
    } catch (e) {
      console.error('daily-report route failed:', (e as Error).message);
      await warnOrders(`Маршрут ${esc(date)} в группу курьера не отправлен (ошибка). Кнопка «Отправить маршрут курьеру сейчас» в админке повторит.`);
    }
  }
  const failed = (courier && !courier.ok) || (kitchenRes && !kitchenRes.ok);
  if (failed) return json({ ok: false, code: 'telegram_failed', courier, kitchen: kitchenRes }, 502);
  return json({ ok: true, date, ...(courier ?? {}), kitchen: kitchenRes, route });
});
