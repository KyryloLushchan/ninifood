import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsFor } from '../_shared/cors.ts';
import { nowDanang } from '../_shared/dates.ts';
import { esc, tg } from '../_shared/telegram.ts';

/**
 * Полное удаление заказа из админки (orders + order_days каскадом) и правка сообщения в группе Orders.
 * Всё в БД идёт от имени вызывающего (его JWT) — удалять может только админ по RLS (is_admin()).
 * verify_jwt пропускает и anon-ключ, поэтому админство проверяем здесь явно.
 */
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
  const { data: u } = await db.auth.getUser(auth.replace(/^Bearer\s+/i, ''));
  const who = u.user?.email ?? 'админ';

  let id = '';
  try {
    const body = await req.json();
    id = typeof body?.id === 'string' ? body.id : '';
  } catch { /* пусто */ }
  if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ ok: false, code: 'bad_request' }, 400);

  const { data: order, error: readErr } = await db.from('orders').select('id, order_number, tg_message_id').eq('id', id).maybeSingle();
  if (readErr) {
    console.error('delete-order read failed:', readErr.message);
    return json({ ok: false, code: 'server_error' }, 500);
  }
  if (!order) return json({ ok: false, code: 'not_found' }, 404);

  // Сначала БД (она главная); order_days удаляются каскадом.
  const { error: delErr } = await db.from('orders').delete().eq('id', id);
  if (delErr) {
    console.error(`delete-order failed for ${order.order_number}:`, delErr.message);
    return json({ ok: false, code: 'server_error' }, 500);
  }
  console.log(`order ${order.order_number} deleted by ${who}`);

  // Потом сообщение в группе. Если редактирование не удалось — заказ уже удалён, сообщаем флагом.
  let telegram: 'edited' | 'failed' | 'none' = 'none';
  if (order.tg_message_id) {
    const chat_id = Deno.env.get('ORDERS_CHAT_ID')!;
    const text = `🗑 Заказ ${order.order_number} удалён из админки\n${esc(who)}, ${nowDanang()}`;
    const reply_markup = { inline_keyboard: [] };
    // Сообщение с фото — это подпись (caption), текстовое — text; заранее не знаем какое, пробуем оба.
    let r = await tg('editMessageText', { chat_id, message_id: order.tg_message_id, text, reply_markup, disable_web_page_preview: true });
    if (!r.ok) r = await tg('editMessageCaption', { chat_id, message_id: order.tg_message_id, caption: text, reply_markup });
    if (r.ok) telegram = 'edited';
    else {
      telegram = 'failed';
      console.error(`delete-order: telegram edit failed for ${order.order_number}:`, r.description);
    }
  }
  return json({ ok: true, telegram });
});
