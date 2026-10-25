import { createClient } from 'npm:@supabase/supabase-js@2';
import { addDays, isSunday, isWeekday, todayISO } from '../_shared/dates.ts';
import { buildOrderText, keyboardNew, plainLength, type OrderRow } from '../_shared/order-text.ts';
import { tg } from '../_shared/telegram.ts';

const BOOKABLE_DAYS = 6; // как на фронте: ближайшие 6 доступных дней для разового заказа
const WINDOW_DAYS = 14; // окно для подписки
const SUB_DAYS = 5;
const MAX_QTY = 99;
const MAX_FILE = 5 * 1024 * 1024;

// Разрешённые Origin для браузера (github.io — на переходный период, потом убрать).
const ALLOWED_ORIGINS = new Set([
  'https://ninifoodvn.com',
  'https://www.ninifoodvn.com',
  'https://kyrylolushchan.github.io',
]);

const corsFor = (origin: string | null): Record<string, string> => ({
  ...(origin && ALLOWED_ORIGINS.has(origin) ? { 'Access-Control-Allow-Origin': origin } : {}),
  Vary: 'Origin',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
});

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

Deno.serve(async (req) => {
  const cors = corsFor(req.headers.get('origin'));
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
  const fail = (code: string, status = 400) => json({ ok: false, code }, status);

  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return fail('bad_request', 405);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail('bad_request');
  }

  let p: any;
  try {
    p = JSON.parse(String(form.get('payload') ?? ''));
  } catch {
    return fail('bad_request');
  }

  // ── валидация ──
  const type = p.type === 'once' || p.type === 'single' ? 'single' : p.type === 'sub' || p.type === 'subscription' ? 'subscription' : null;
  const payment = p.payment === 'qr' || p.payment === 'cash' ? p.payment : null;
  const telegram = str(p.telegram, 64);
  const address = str(p.address, 300);
  const hotel = str(p.hotel, 150);
  const comment = str(p.comment, 500);
  const lang = ['ua', 'ru', 'en', 'vi'].includes(p.lang) ? p.lang : null;
  const qty = Number(p.portions);

  if (!type || !payment) return fail('bad_request');
  if (!telegram) return fail('telegram_required');
  if (!address) return fail('address_required');
  if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) return fail('bad_portions');

  const today = todayISO();
  const window = Array.from({ length: WINDOW_DAYS }, (_, i) => addDays(today, i + 1)).filter((d) => !isSunday(d));
  const days: string[] = Array.isArray(p.days) ? [...new Set<string>(p.days.map(String))].sort() : [];
  const allowed = new Set(type === 'single' ? window.slice(0, BOOKABLE_DAYS) : window.filter(isWeekday));
  if (days.length < 1 || !days.every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && allowed.has(d))) return fail('bad_days');
  if (type === 'subscription' && days.length !== SUB_DAYS) return fail('bad_days');

  let shot: File | null = null;
  if (payment === 'qr') {
    const f = form.get('screenshot');
    if (!(f instanceof File) || f.size === 0) return fail('screenshot_required');
    if (!['image/jpeg', 'image/png'].includes(f.type)) return fail('screenshot_type');
    if (f.size > MAX_FILE) return fail('screenshot_size');
    shot = f;
  }

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

  // ── цена: только из settings ──
  const { data: settings, error: sErr } = await db.from('settings').select('key, value').in('key', ['price_single', 'price_subscription']);
  if (sErr || !settings) {
    console.error('settings error', sErr?.message);
    return fail('server_error', 500);
  }
  const price = Object.fromEntries(settings.map((s) => [s.key, Number(s.value)]));
  if (!(price.price_single > 0) || !(price.price_subscription > 0)) {
    console.error('settings: prices missing');
    return fail('server_error', 500);
  }
  const total = type === 'single' ? days.length * qty * price.price_single : qty * price.price_subscription;

  // ── сохраняем заказ (номер выдаёт БД) ──
  const { data: order, error: oErr } = await db
    .from('orders')
    .insert({
      type,
      telegram,
      address,
      hotel: hotel || null,
      comment: comment || null,
      payment_method: payment,
      qty,
      total,
      lang,
    })
    .select('id, order_number')
    .single();
  if (oErr || !order) {
    console.error('insert order error', oErr?.message);
    return fail('server_error', 500);
  }
  const { error: dErr } = await db.from('order_days').insert(days.map((d) => ({ order_id: order.id, delivery_date: d, qty })));
  if (dErr) {
    console.error(`insert order_days error for ${order.order_number}:`, dErr.message);
    await db.from('orders').delete().eq('id', order.id);
    return fail('server_error', 500);
  }

  // ── Telegram ──
  const row: OrderRow = { order_number: order.order_number, type, telegram, address, hotel: hotel || null, comment: comment || null, payment_method: payment, qty, total, lang };
  const text = buildOrderText(row, days);
  const chat_id = Deno.env.get('ORDERS_CHAT_ID')!;
  let messageId: number | null = null;
  let fileId: string | null = null;

  const photoForm = (extra: Record<string, string>) => {
    const fd = new FormData();
    fd.set('chat_id', chat_id);
    fd.set('photo', shot!, shot!.name || 'payment.jpg');
    for (const [k, v] of Object.entries(extra)) fd.set(k, v);
    return fd;
  };
  const pickFileId = (r: any) => (r?.photo?.length ? r.photo[r.photo.length - 1].file_id : null);

  try {
    if (payment === 'qr' && plainLength(text) <= 1024) {
      const r = await tg('sendPhoto', photoForm({ caption: text, parse_mode: 'HTML', reply_markup: JSON.stringify(keyboardNew(order.order_number)) }));
      if (r.ok) {
        messageId = r.result.message_id;
        fileId = pickFileId(r.result);
      } else console.error(`telegram sendPhoto failed for ${order.order_number}:`, r.description);
    } else {
      const r = await tg('sendMessage', { chat_id, text, parse_mode: 'HTML', reply_markup: keyboardNew(order.order_number), disable_web_page_preview: true });
      if (r.ok) {
        messageId = r.result.message_id;
        if (payment === 'qr') {
          const pr = await tg('sendPhoto', photoForm({ reply_to_message_id: String(messageId) }));
          if (pr.ok) fileId = pickFileId(pr.result);
          else console.error(`telegram sendPhoto (reply) failed for ${order.order_number}:`, pr.description);
        }
      } else console.error(`telegram sendMessage failed for ${order.order_number}:`, r.description);
    }
  } catch (e) {
    console.error(`telegram error for ${order.order_number}:`, (e as Error).message);
  }

  if (messageId !== null || fileId !== null) {
    const { error } = await db.from('orders').update({ tg_message_id: messageId, receipt_file_id: fileId }).eq('id', order.id);
    if (error) console.error(`update tg ids failed for ${order.order_number}:`, error.message);
  } else {
    console.error(`order ${order.order_number} saved but NOT delivered to Telegram (tg_message_id = null)`);
  }

  return json({ ok: true, orderNumber: order.order_number });
});
