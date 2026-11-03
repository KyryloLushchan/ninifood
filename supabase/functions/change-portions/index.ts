import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsFor } from '../_shared/cors.ts';
import { dict, diffLine } from '../_shared/order-i18n.ts';
import { esc, tg } from '../_shared/telegram.ts';

/**
 * Изменение порций в заказе из админки. Всё в БД делает RPC admin_change_portions от имени вызывающего (его JWT):
 * внутри проверка is_admin(), пересчёт суммы по правилам заказа, журнал, доплата. Здесь — вызов RPC и уведомление в группу Orders.
 * verify_jwt пропускает и anon-ключ, поэтому админство проверяем явно (и ещё раз внутри RPC).
 */
const ERRORS: Record<string, number> = { forbidden: 403, not_found: 404, order_cancelled: 409, day_locked: 409, bad_qty: 400, no_changes: 400, bad_request: 400 };
const money = (n: number) => `${Math.abs(n).toLocaleString('ru-RU').replace(/ /g, ' ')} ₫`;

Deno.serve(async (req) => {
  const cors = corsFor(req.headers.get('origin'));
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json({ ok: false, code: 'bad_request' }, 405);

  const auth = req.headers.get('authorization') ?? '';
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  });
  const { data: isAdmin, error: adminErr } = await db.rpc('is_admin');
  if (adminErr || isAdmin !== true) return json({ ok: false, code: 'forbidden' }, 403);

  let id = '';
  let days: { id: number; qty: number }[] = [];
  try {
    const body = await req.json();
    id = typeof body?.id === 'string' ? body.id : '';
    if (Array.isArray(body?.days)) days = body.days.map((d: any) => ({ id: Number(d?.id), qty: Number(d?.qty) }));
  } catch { /* пусто */ }
  if (!/^[0-9a-f-]{36}$/i.test(id) || days.length === 0 || days.length > 100 || days.some((d) => !Number.isInteger(d.id) || !Number.isInteger(d.qty))) {
    return json({ ok: false, code: 'bad_request' }, 400);
  }

  const { data, error } = await db.rpc('admin_change_portions', { p_order: id, p_days: days });
  if (error) {
    const code = Object.keys(ERRORS).find((c) => error.message.includes(c)) ?? 'server_error';
    if (code === 'server_error') console.error('change-portions rpc failed:', error.message);
    return json({ ok: false, code }, ERRORS[code] ?? 500);
  }
  const r = data as {
    order_number: string; telegram: string; tg_message_id: number | null; payment_method: string;
    old_total: number; new_total: number; diff: number; old_portions: number; new_portions: number; surcharge_id: number | null; surcharge_status: string | null;
  };

  // Уведомление в группу Orders (ответом на сообщение заказа, если оно есть). Ошибка Telegram изменения не откатывает.
  let telegram: 'sent' | 'failed' = 'sent';
  // Уведомление — на языке заказа (нет языка — русский).
  const { data: lg } = await db.from('orders').select('lang').eq('order_number', r.order_number).maybeSingle();
  const money_line = diffLine(r.diff, money(r.diff), lg?.lang);
  const text = dict(lg?.lang).portionsChanged(esc(r.order_number), r.old_portions, r.new_portions, money_line);
  const res = await tg('sendMessage', {
    chat_id: Deno.env.get('ORDERS_CHAT_ID')!,
    text,
    parse_mode: 'HTML',
    ...(r.tg_message_id ? { reply_to_message_id: r.tg_message_id, allow_sending_without_reply: true } : {}),
  });
  if (!res.ok) {
    telegram = 'failed';
    console.error(`change-portions telegram failed for ${r.order_number}:`, res.description);
  }
  return json({ ok: true, telegram, ...r });
});
