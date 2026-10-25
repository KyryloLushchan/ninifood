import { createClient } from 'npm:@supabase/supabase-js@2';
import { nowDanang } from '../_shared/dates.ts';
import { buildOrderText, keyboardConfirmed, keyboardNone, type OrderRow } from '../_shared/order-text.ts';
import { tg } from '../_shared/telegram.ts';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});
const ADMINS = new Set((Deno.env.get('ADMIN_TG_IDS') ?? '').split(',').map((s) => s.trim()).filter(Boolean));

const ok = () => new Response('ok');

Deno.serve(async (req) => {
  if (req.headers.get('x-telegram-bot-api-secret-token') !== Deno.env.get('TG_WEBHOOK_SECRET')) {
    return new Response('forbidden', { status: 401 });
  }
  let update: any;
  try {
    update = await req.json();
  } catch {
    return ok();
  }
  const cb = update.callback_query;
  if (!cb) return ok();

  const answer = (text: string) => tg('answerCallbackQuery', { callback_query_id: cb.id, text });

  if (!ADMINS.has(String(cb.from?.id))) {
    await answer('Нет доступа');
    return ok();
  }

  const msg = cb.message;
  const m = /^([cx]):(NF-\d+)$/.exec(cb.data ?? '');
  if (!m || !msg || String(msg.chat.id) !== Deno.env.get('ORDERS_CHAT_ID')) {
    await answer('Некорректная кнопка');
    return ok();
  }
  const [, action, number] = m;

  const { data: order } = await db.from('orders').select('*').eq('order_number', number).maybeSingle();
  if (!order) {
    await answer('Заказ не найден');
    return ok();
  }

  let next: 'confirmed' | 'cancelled';
  let label: string;
  if (action === 'c') {
    if (order.status !== 'new') {
      await answer(`Уже обработан: ${order.status}`);
      return ok();
    }
    next = 'confirmed';
    label = '✅ Подтверждён';
  } else {
    if (order.status === 'delivered') {
      await answer('Заказ уже доставлен');
      return ok();
    }
    if (order.status === 'cancelled') {
      await answer('Уже отклонён');
      return ok();
    }
    next = 'cancelled';
    label = order.status === 'confirmed' ? '❌ Отменён' : '❌ Отклонён';
  }

  const by: string = cb.from.username ?? String(cb.from.id);
  const { error } = await db
    .from('orders')
    .update({ status: next, status_changed_at: new Date().toISOString(), status_changed_by: by })
    .eq('id', order.id);
  if (error) {
    console.error(`status update failed for ${number}:`, error.message);
    await answer('Ошибка, попробуйте ещё раз');
    return ok();
  }

  const { data: days } = await db.from('order_days').select('delivery_date').eq('order_id', order.id);
  const text = buildOrderText(order as OrderRow, (days ?? []).map((d) => d.delivery_date), `${label} — @${by}, ${nowDanang()}`);
  const reply_markup = next === 'confirmed' ? keyboardConfirmed(number) : keyboardNone;
  const isPhoto = Array.isArray(msg.photo) && msg.photo.length > 0;
  const r = isPhoto
    ? await tg('editMessageCaption', { chat_id: msg.chat.id, message_id: msg.message_id, caption: text, parse_mode: 'HTML', reply_markup })
    : await tg('editMessageText', { chat_id: msg.chat.id, message_id: msg.message_id, text, parse_mode: 'HTML', reply_markup, disable_web_page_preview: true });
  if (!r.ok) console.error(`edit message failed for ${number}:`, r.description);

  await answer(next === 'confirmed' ? 'Подтверждено' : 'Отклонено');
  return ok();
});
