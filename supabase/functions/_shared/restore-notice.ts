import { nowDanang } from './dates.ts';
import { dict } from './order-i18n.ts';
import { buildOrderText, getDeliveryHours, keyboardConfirmed, type OrderRow } from './order-text.ts';
import { esc, tg } from './telegram.ts';

/**
 * Заказ восстановлен из отмены: (1) исходное сообщение в Orders обновляется — статус «♻️ Відновлено — @кто, время» (на языке заказа), снова кнопка «↩️ Отменить»;
 * (2) ответом на него — та же строка. Ошибка Telegram восстановление не откатывает. db — клиент с правом чтения orders/order_days.
 */
export async function notifyRestored(db: any, orderNumber: string, by: string): Promise<'sent' | 'failed'> {
  const { data: order } = await db.from('orders').select('*').eq('order_number', orderNumber).maybeSingle();
  if (!order) return 'failed';
  const { data: days } = await db.from('order_days').select('delivery_date').eq('order_id', order.id);
  const line = `${dict(order.lang).restored} — @${esc(by)}, ${nowDanang()}`;
  const chat = Deno.env.get('ORDERS_CHAT_ID')!;
  let ok = true;
  if (order.tg_message_id) {
    const text = buildOrderText(order as OrderRow, (days ?? []).map((d: { delivery_date: string }) => d.delivery_date), line, await getDeliveryHours(db));
    const reply_markup = keyboardConfirmed(orderNumber);
    const r = order.receipt_file_id
      ? await tg('editMessageCaption', { chat_id: chat, message_id: order.tg_message_id, caption: text, parse_mode: 'HTML', reply_markup })
      : await tg('editMessageText', { chat_id: chat, message_id: order.tg_message_id, text, parse_mode: 'HTML', reply_markup, disable_web_page_preview: true });
    if (!r.ok) {
      ok = false;
      console.error(`restore: edit message failed for ${orderNumber}:`, r.description);
    }
  }
  const n = await tg('sendMessage', { chat_id: chat, text: line, parse_mode: 'HTML', ...(order.tg_message_id ? { reply_to_message_id: order.tg_message_id, allow_sending_without_reply: true } : {}) });
  if (!n.ok) {
    ok = false;
    console.error(`restore: notice failed for ${orderNumber}:`, n.description);
  }
  return ok ? 'sent' : 'failed';
}
