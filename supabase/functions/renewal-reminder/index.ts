import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsFor } from '../_shared/cors.ts';
import { todayISO } from '../_shared/dates.ts';
import { CODE_RE, entryBlock, newCode, selectEntries, SITE_URL, TITLE, type EndingOrder, type FutureOrder } from '../_shared/renewal.ts';
import { safeEqual } from '../_shared/security.ts';
import { esc, tg } from '../_shared/telegram.ts';

const SAFE = 3900; // запас под теги до лимита Telegram 4096

/**
 * Ежедневно в 18:00 (Дананг, pg_cron): в группу «NiniFood Renewals» (секрет RENEWALS_CHAT_ID) — клиенты, у которых СЕГОДНЯ последний день подписки
 * и нет заказа/подписки на ближайшие дни, с готовым текстом и одноразовой ссылкой продления. Никого нет — ничего не отправляется.
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

  // Подписки (подтверждённые/доставленные) с днём доставки сегодня → их заказы целиком (все дни) → оставляем те, у которых последний день = сегодня.
  const { data: todays, error: e1 } = await db
    .from('order_days')
    .select('order_id, orders!inner(type, status)')
    .eq('delivery_date', today)
    .eq('orders.type', 'subscription')
    .in('orders.status', ['confirmed', 'delivered']);
  if (e1) {
    console.error('renewal-reminder query failed:', e1.message);
    return json({ ok: false, code: 'server_error' }, 500);
  }
  const ids = [...new Set((todays ?? []).map((r: any) => r.order_id as string))];
  if (!ids.length) return json({ ok: true, count: 0 });
  const { data: orders, error: e2 } = await db.from('orders').select('id, order_number, telegram, phone, customer_id, order_days(delivery_date, qty)').in('id', ids);
  if (e2) {
    console.error('renewal-reminder orders failed:', e2.message);
    return json({ ok: false, code: 'server_error' }, 500);
  }
  const ending: EndingOrder[] = (orders ?? []).map((o: any) => {
    const days: { delivery_date: string; qty: number }[] = o.order_days ?? [];
    const last = days.map((d) => d.delivery_date).sort().pop() ?? '';
    return { id: o.id, order_number: o.order_number, telegram: o.telegram, phone: o.phone, customer_id: o.customer_id, daysCount: days.length, lastDay: last, lastQty: days.find((d) => d.delivery_date === last)?.qty ?? 1 };
  });

  // Заказы с днями после сегодня (new/confirmed/delivered; отменённые не в счёт) — у этих клиентов продление уже есть.
  const { data: fut, error: e3 } = await db.from('order_days').select('orders!inner(telegram, phone, customer_id, status)').gt('delivery_date', today).in('orders.status', ['new', 'confirmed', 'delivered']);
  if (e3) {
    console.error('renewal-reminder future failed:', e3.message);
    return json({ ok: false, code: 'server_error' }, 500);
  }
  const future: FutureOrder[] = (fut ?? []).map((r: any) => ({ telegram: r.orders.telegram, phone: r.orders.phone, customer_id: r.orders.customer_id }));

  const entries = selectEntries(today, ending, future);
  if (!entries.length) return json({ ok: true, count: 0 });

  // Одноразовые ссылки: на заказ — одна действующая (повторный запуск в тот же день отдаёт ту же ссылку).
  const blocks: string[] = [];
  for (const e of entries) {
    let code: string | null = null;
    const { data: ex } = await db.from('renewal_links').select('code').eq('order_id', e.primaryId).is('used_at', null).gt('expires_at', new Date().toISOString()).limit(1).maybeSingle();
    if (ex && CODE_RE.test(ex.code)) code = ex.code;
    if (!code) {
      code = newCode();
      const { error } = await db.from('renewal_links').insert({ code, order_id: e.primaryId, portions: Math.min(99, Math.max(1, e.portions)) });
      if (error) {
        console.error('renewal link insert failed:', error.message);
        await warn(`Напоминания о продлении: не удалось создать ссылку для ${esc(e.orders.join(' + '))}.`);
        continue;
      }
    }
    blocks.push(entryBlock(e, `${SITE_URL}/?r=${code}`));
  }
  if (!blocks.length) return json({ ok: false, code: 'server_error' }, 500);

  const chat = Deno.env.get('RENEWALS_CHAT_ID') ?? '';
  if (!chat) {
    await warn('Напоминания о продлении не отправлены: не задан RENEWALS_CHAT_ID.');
    return json({ ok: false, code: 'chat_missing' }, 409);
  }
  // Режем на сообщения до лимита Telegram, не разрывая блок клиента.
  const messages: string[] = [];
  let cur = TITLE;
  for (const b of blocks) {
    if (cur.length + 2 + b.length > SAFE) {
      messages.push(cur);
      cur = b;
    } else cur = `${cur}\n\n${b}`;
  }
  messages.push(cur);
  for (const text of messages) {
    const r = await tg('sendMessage', { chat_id: chat, text, parse_mode: 'HTML', disable_web_page_preview: true });
    if (!r.ok) {
      console.error('renewal-reminder telegram failed:', r.description);
      await warn(`Не удалось отправить напоминания о продлении (${esc(String(r.description ?? 'ошибка Telegram'))}). Если группа стала супергруппой, обновите RENEWALS_CHAT_ID.`);
      return json({ ok: false, code: 'telegram_failed' }, 502);
    }
  }
  return json({ ok: true, count: blocks.length, messages: messages.length });
});
