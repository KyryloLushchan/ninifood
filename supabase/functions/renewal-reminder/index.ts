import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsFor } from '../_shared/cors.ts';
import { todayISO } from '../_shared/dates.ts';
import { entryMessage, firstSingleMessage, nickKey, selectEntries, selectFirstSingle, type AnyOrder, type EndingOrder, type FirstNotice, type FutureOrder } from '../_shared/renewal.ts';
import { safeEqual } from '../_shared/security.ts';
import { esc, tg } from '../_shared/telegram.ts';

/**
 * Ежедневно в 20:00 (Дананг, pg_cron): в группу «NiniFood Renewals» (секрет RENEWALS_CHAT_ID) — по отдельному сообщению на клиента: (1) у кого СЕГОДНЯ последний день подписки
 * и нет заказа/подписки на ближайшие дни (продление + приглашение в группу отзывов); (2) «🆕 Первый разовый» — сегодня доставка самого первого (разового) заказа клиента, других заказов на ближайшие дни нет, один раз за всё время
 * (таблица renewal_first_notices). Готовый текст на языке заказа, без превью ссылок. Никого нет — ничего не отправляется.
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
  const warn = async (text: string) => {
    try {
      await tg('sendMessage', { chat_id: Deno.env.get('ORDERS_CHAT_ID')!, text: `⚠️ ${text}`, parse_mode: 'HTML' });
    } catch (e) {
      console.error('renewal warn failed:', (e as Error).message);
    }
  };

  const chat = Deno.env.get('RENEWALS_CHAT_ID') ?? '';
  const fail = (code: string, status: number) => json({ ok: false, code }, status);

  // ── 1) Продление: подписки (подтверждённые/доставленные) с днём доставки сегодня → их заказы целиком (все дни) → оставляем те, у которых последний день = сегодня.
  const { data: todays, error: e1 } = await db
    .from('order_days')
    .select('order_id, orders!inner(type, status)')
    .eq('delivery_date', today)
    .eq('orders.type', 'subscription')
    .in('orders.status', ['confirmed', 'delivered']);
  if (e1) {
    console.error('renewal-reminder query failed:', e1.message);
    return fail('server_error', 500);
  }
  const ids = [...new Set((todays ?? []).map((r: any) => r.order_id as string))];
  let entries: ReturnType<typeof selectEntries> = [];
  if (ids.length) {
    const { data: orders, error: e2 } = await db.from('orders').select('id, order_number, telegram, phone, customer_id, lang, order_days(delivery_date, qty)').in('id', ids);
    if (e2) {
      console.error('renewal-reminder orders failed:', e2.message);
      return fail('server_error', 500);
    }
    const ending: EndingOrder[] = (orders ?? []).map((o: any) => {
      const days: { delivery_date: string; qty: number }[] = o.order_days ?? [];
      const last = days.map((d) => d.delivery_date).sort().pop() ?? '';
      return { id: o.id, order_number: o.order_number, telegram: o.telegram, phone: o.phone, customer_id: o.customer_id, lang: o.lang, daysCount: days.length, lastDay: last, lastQty: days.find((d) => d.delivery_date === last)?.qty ?? 1 };
    });
    // Заказы с днями после сегодня (new/confirmed/delivered; отменённые не в счёт) — у этих клиентов продление уже есть.
    const { data: fut, error: e3 } = await db.from('order_days').select('orders!inner(telegram, phone, customer_id, status)').gt('delivery_date', today).in('orders.status', ['new', 'confirmed', 'delivered']);
    if (e3) {
      console.error('renewal-reminder future failed:', e3.message);
      return fail('server_error', 500);
    }
    const future: FutureOrder[] = (fut ?? []).map((r: any) => ({ telegram: r.orders.telegram, phone: r.orders.phone, customer_id: r.orders.customer_id }));
    entries = selectEntries(today, ending, future);
  }

  // ── 2) «Первый разовый»: клиенты, у которых сегодня доставка самого первого заказа (разового) и других заказов на ближайшие дни нет; каждому — один раз за всё время.
  const { data: allRows, error: e4 } = await db
    .from('orders')
    .select('id, order_number, telegram, phone, customer_id, created_at, lang, status, type, order_days(delivery_date, qty)')
    .in('status', ['new', 'confirmed', 'delivered'])
    .limit(5000);
  const { data: noticeRows, error: e5 } = await db.from('renewal_first_notices').select('nick, phone, customer_id');
  if (e4 || e5) {
    console.error('renewal-reminder first-single query failed:', (e4 ?? e5)!.message);
    return fail('server_error', 500);
  }
  const all: AnyOrder[] = (allRows ?? []).map((o: any) => ({ id: o.id, order_number: o.order_number, telegram: o.telegram, phone: o.phone, customer_id: o.customer_id, created_at: o.created_at, lang: o.lang, status: o.status, type: o.type, days: o.order_days ?? [] }));
  const firsts = selectFirstSingle(today, all, (noticeRows ?? []) as FirstNotice[]);
  let perLunch = 150_000;
  if (firsts.length) {
    const { data: pr } = await db.from('settings').select('value').eq('key', 'price_subscription').maybeSingle();
    const n = Number(pr?.value);
    if (Number.isFinite(n) && n > 0) perLunch = Math.round(n / 5);
  }

  if (!entries.length && !firsts.length) return json({ ok: true, count: 0, first: 0 });
  if (!chat) {
    await warn('Напоминания (продление / первый разовый) не отправлены: не задан RENEWALS_CHAT_ID.');
    return fail('chat_missing', 409);
  }
  const send = async (text: string) => {
    const r = await tg('sendMessage', { chat_id: chat, text, parse_mode: 'HTML', disable_web_page_preview: true });
    if (!r.ok) {
      console.error('renewal-reminder telegram failed:', r.description);
      await warn(`Не удалось отправить напоминания (${esc(String(r.description ?? 'ошибка Telegram'))}). Если группа стала супергруппой, обновите RENEWALS_CHAT_ID.`);
    }
    return r.ok;
  };
  // Одно сообщение на клиента (несколько заказов одного клиента — уже одна запись).
  for (const e of entries) {
    if (!(await send(entryMessage(e)))) return fail('telegram_failed', 502);
    // запоминаем отправку: через 2 дня к ней вернётся renewal-followup (повторное напоминание)
    await db.from('renewal_sent').insert({ kind: 'renewal', nick: nickKey(e.nick) || null, phone: e.phone, customer_id: e.customer_id, order_number: e.orders[0] });
  }
  for (const f of firsts) {
    if (!(await send(firstSingleMessage(f, perLunch)))) return fail('telegram_failed', 502);
    await db.from('renewal_sent').insert({ kind: 'first_single', nick: nickKey(f.nick) || null, phone: f.phone, customer_id: f.customer_id, order_number: f.order_number });
    await db.from('renewal_first_notices').insert({ nick: nickKey(f.nick) || null, phone: f.phone, customer_id: f.customer_id, order_number: f.order_number });
  }
  return json({ ok: true, count: entries.length, first: firsts.length });
});
