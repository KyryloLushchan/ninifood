import { createClient } from 'npm:@supabase/supabase-js@2';
import '../_shared/redact.ts';
import { errMsg } from '../_shared/redact.ts';
import { safeEqual } from '../_shared/security.ts';
import { tg } from '../_shared/telegram.ts';
import { nowDanang } from '../_shared/dates.ts';
import { statusLabel } from '../_shared/order-i18n.ts';
import { buildOrderText, getDeliveryHours, keyboardConfirmed, keyboardNew, plainLength, type OrderRow } from '../_shared/order-text.ts';

const MAX_ATTEMPTS = 5;
const MIN_AGE_MS = 2 * 60_000; // свежий заказ ещё может досылаться самим send-order
const RETRY_GAP_MS = 4 * 60_000;
const MAX_AGE_MS = 3 * 86400_000;
const BATCH = 10;

/**
 * Досылка в группу Orders заказов без сообщения (`orders.tg_message_id is null`): cron каждые 5 минут (`tg-resend`), до 5 попыток на заказ.
 * Без дублей: попытка «занимается» атомарно (tg_attempts+1 только если tg_message_id всё ещё null и счётчик не менялся), id сообщения пишется
 * условно (`is null`). Скриншот оплаты берётся из закрытого бакета pending-receipts (его кладёт send-order до отправки) и удаляется после успеха.
 * Отменённые заказы не досылаются. Тело `{"only":["NF-1117"]}` — разово, в обход возраста/интервала/лимита попыток (вручную).
 * Доступ: заголовок x-cron-secret (verify_jwt выключен).
 */
Deno.serve(async (req) => {
  if (!(await safeEqual(req.headers.get('x-cron-secret') ?? '', Deno.env.get('CRON_SECRET') ?? ''))) return new Response('forbidden', { status: 401 });
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  let only: string[] | null = null;
  try {
    const b = await req.json();
    if (Array.isArray(b?.only)) only = b.only.map(String).filter((x: string) => /^NF-\d+$/.test(x));
  } catch { /* cron: пустое тело */ }

  const now = Date.now();
  let q = db.from('orders').select('*').is('tg_message_id', null).order('created_at').limit(BATCH);
  if (only) q = q.in('order_number', only);
  else q = q.neq('status', 'cancelled').lt('tg_attempts', MAX_ATTEMPTS).lt('created_at', new Date(now - MIN_AGE_MS).toISOString()).gt('created_at', new Date(now - MAX_AGE_MS).toISOString());
  const { data: orders, error } = await q;
  if (error) {
    console.error('tg-resend select failed:', error.message);
    return Response.json({ ok: false }, { status: 500 });
  }
  const hours = await getDeliveryHours(db);
  const chat_id = Deno.env.get('ORDERS_CHAT_ID')!;
  const result: Record<string, string> = {};

  for (const o of orders ?? []) {
    try {
      if (!only && o.tg_last_attempt && now - new Date(o.tg_last_attempt).getTime() < RETRY_GAP_MS) continue;
      // «занимаем» попытку: если параллельный запуск уже взял заказ или сообщение появилось — пропускаем
      const { data: claimed } = await db
        .from('orders')
        .update({ tg_attempts: o.tg_attempts + 1, tg_last_attempt: new Date().toISOString() })
        .eq('id', o.id)
        .is('tg_message_id', null)
        .eq('tg_attempts', o.tg_attempts)
        .select('id');
      if (!claimed?.length) {
        result[o.order_number] = 'skip';
        continue;
      }
      const { data: days } = await db.from('order_days').select('delivery_date').eq('order_id', o.id);
      if (!days?.length) {
        result[o.order_number] = 'no days';
        continue;
      }
      const statusLine = o.status === 'confirmed' || o.status === 'delivered'
        ? `${statusLabel('confirmed', o.lang)} — ${o.status_changed_by && !String(o.status_changed_by).includes('@') ? '@' + o.status_changed_by : 'админка'}, ${nowDanang(o.status_changed_at ? new Date(o.status_changed_at) : undefined)}`
        : undefined;
      let text = buildOrderText(o as OrderRow, days.map((d: any) => d.delivery_date), statusLine, hours);
      const reply_markup = o.status === 'new' ? keyboardNew(o.order_number) : keyboardConfirmed(o.order_number);

      let shot: File | null = null;
      if (o.receipt_path) {
        const dl = await db.storage.from('pending-receipts').download(o.receipt_path);
        if (dl.data) shot = new File([dl.data], o.receipt_path.endsWith('.png') ? 'payment.png' : 'payment.jpg', { type: o.receipt_path.endsWith('.png') ? 'image/png' : 'image/jpeg' });
        else console.error(`tg-resend: receipt download failed for ${o.order_number}:`, dl.error?.message);
      }
      if (!shot && o.payment_method !== 'cash') text += '\n\n⚠️ <b>Скриншот оплаты не сохранился</b> (сбой при отправке заказа) — запросите его у клиента.';

      let messageId: number | null = null;
      let fileId: string | null = null;
      const pickFileId = (r: any) => (r?.photo?.length ? r.photo[r.photo.length - 1].file_id : null);
      const photoForm = (extra: Record<string, string>) => {
        const fd = new FormData();
        fd.set('chat_id', chat_id);
        fd.set('photo', shot!, shot!.name);
        for (const [k, v] of Object.entries(extra)) fd.set(k, v);
        return fd;
      };
      if (shot && plainLength(text) <= 1024) {
        const r = await tg('sendPhoto', photoForm({ caption: text, parse_mode: 'HTML', reply_markup: JSON.stringify(reply_markup) }));
        if (r.ok) {
          messageId = r.result.message_id;
          fileId = pickFileId(r.result);
        } else console.error(`tg-resend sendPhoto failed for ${o.order_number}:`, r.description);
      } else {
        const r = await tg('sendMessage', { chat_id, text, parse_mode: 'HTML', reply_markup, disable_web_page_preview: true });
        if (r.ok) {
          messageId = r.result.message_id;
          if (shot) {
            const pr = await tg('sendPhoto', photoForm({ reply_to_message_id: String(messageId) }));
            if (pr.ok) fileId = pickFileId(pr.result);
            else console.error(`tg-resend sendPhoto (reply) failed for ${o.order_number}:`, pr.description);
          }
        } else console.error(`tg-resend sendMessage failed for ${o.order_number}:`, r.description);
      }
      if (messageId === null) {
        result[o.order_number] = `failed (attempt ${o.tg_attempts + 1}/${MAX_ATTEMPTS})`;
        continue;
      }
      const { error: uErr } = await db.from('orders').update({ tg_message_id: messageId, receipt_file_id: fileId, receipt_path: null }).eq('id', o.id).is('tg_message_id', null);
      if (uErr) console.error(`tg-resend: saving message id failed for ${o.order_number} (message ${messageId} sent):`, uErr.message);
      if (o.receipt_path) await db.storage.from('pending-receipts').remove([o.receipt_path]);
      result[o.order_number] = `sent #${messageId}`;
      console.log(`tg-resend: ${o.order_number} sent to Orders (attempt ${o.tg_attempts + 1})`);
    } catch (e) {
      console.error(`tg-resend error for ${o.order_number}:`, errMsg(e));
      result[o.order_number] = 'error';
    }
  }
  return Response.json({ ok: true, result });
});
