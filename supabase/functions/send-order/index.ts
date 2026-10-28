import { createClient } from 'npm:@supabase/supabase-js@2';
import { addDays, isSunday, todayISO } from '../_shared/dates.ts';
import { inDanang } from '../_shared/danang.ts';
import { buildOrderText, keyboardNew, plainLength, type OrderRow } from '../_shared/order-text.ts';
import { corsFor } from '../_shared/cors.ts';
import { clientIp, detectImage, sha256hex, verifyTurnstile } from '../_shared/security.ts';
import { esc, tg } from '../_shared/telegram.ts';

const BOOKABLE_DAYS = 6; // как на фронте: ближайшие 6 доступных дней для разового заказа
const WINDOW_DAYS = 14; // окно для подписки
const SUB_MIN_DAYS = 5; // подписка: от 5 дней; обед = price_subscription / 5
const MAX_QTY = 99;
const MAX_FILE = 5 * 1024 * 1024;
const RATE_IP = { max: 3, windowMin: 10 }; // заказов с одного IP за 10 минут
const RATE_CONTACT = { max: 5, windowH: 24 }; // заказов с одного телефона / Telegram за сутки
const ALERT_THRESHOLD = 20; // заказов или ошибок за час → «подозрительная активность»
const SALT = Deno.env.get('IP_HASH_SALT') ?? '';

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

Deno.serve(async (req) => {
  const cors = corsFor(req.headers.get('origin'));
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json({ ok: false, code: 'bad_request' }, 405);

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });
  const ip = clientIp(req);
  const ipHash = ip ? await sha256hex(`${SALT}:${ip}`) : null;
  const country = (req.headers.get('cf-ipcountry') ?? '').slice(0, 8) || null; // гео-фильтра нет — только лог
  const who: { phone: string | null; telegram: string | null } = { phone: null, telegram: null };

  // Каждая попытка пишется в order_attempts: по ней — лимиты и мониторинг (>20 заказов/ошибок за час → алерт в группу).
  const record = async (outcome: string, orderNumber?: string) => {
    try {
      const { error } = await db.from('order_attempts').insert({ ip_hash: ipHash, phone: who.phone, telegram: who.telegram, country, outcome, order_number: orderNumber ?? null });
      if (error) console.error('order_attempts insert failed:', error.message);
      await checkAlerts();
    } catch (e) {
      console.error('record attempt error:', (e as Error).message);
    }
  };
  const checkAlerts = async () => {
    const since = new Date(Date.now() - 3600_000).toISOString();
    const count = async (ok: boolean) => {
      const q = db.from('order_attempts').select('id', { count: 'exact', head: true }).gte('created_at', since);
      return (await (ok ? q.eq('outcome', 'ok') : q.neq('outcome', 'ok'))).count ?? 0;
    };
    const [orders, errors] = await Promise.all([count(true), count(false)]);
    for (const [kind, n, what] of [['orders_spike', orders, 'заказов'], ['errors_spike', errors, 'ошибок send-order']] as const) {
      if (n <= ALERT_THRESHOLD) continue;
      // Не чаще раза в час на вид: обновление проходит только у того, кто первым сдвинул last_sent_at.
      const { data } = await db.from('security_alerts').update({ last_sent_at: new Date().toISOString() }).eq('kind', kind).lt('last_sent_at', since).select('kind');
      if (data?.length) await tg('sendMessage', { chat_id: Deno.env.get('ORDERS_CHAT_ID')!, text: `⚠️ <b>Подозрительная активность</b>\nЗа последний час ${n} ${esc(what)} (порог ${ALERT_THRESHOLD}).`, parse_mode: 'HTML' });
    }
  };
  const fail = async (code: string, status = 400) => {
    await record(code);
    return json({ ok: false, code }, status);
  };

  // Тело больше файла + текстовых полей не разбираем вообще.
  if (Number(req.headers.get('content-length') ?? 0) > MAX_FILE + 200_000) return fail('screenshot_size', 413);

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

  // ── вход через Telegram: JWT пользователя (anon-ключ — гость). Ник берём из профиля, привилегия VIP — только по telegram_id. ──
  let customer: { user_id: string; telegram_id: number; telegram_username: string | null } | null = null;
  let vip = false;
  const jwt = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (jwt && jwt !== Deno.env.get('SUPABASE_ANON_KEY')) {
    const { data } = await db.auth.getUser(jwt);
    const tgId = Number(data.user?.app_metadata?.telegram_id);
    if (data.user && Number.isSafeInteger(tgId)) {
      const { data: c } = await db.from('customers').select('user_id, telegram_id, telegram_username').eq('user_id', data.user.id).maybeSingle();
      if (c && Number(c.telegram_id) === tgId) {
        customer = c;
        vip = !!(await db.from('vip_customers').select('id').eq('telegram_id', tgId).maybeSingle()).data;
      }
    }
  }

  // ── валидация ──
  const type = p.type === 'once' || p.type === 'single' ? 'single' : p.type === 'sub' || p.type === 'subscription' ? 'subscription' : null;
  const payment = p.payment === 'qr' || p.payment === 'cash' || p.payment === 'other' ? p.payment : null;
  const telegram = customer?.telegram_username ? `@${customer.telegram_username}` : str(p.telegram, 64);
  const phone = str(p.phone, 32).replace(/[\s-]/g, '');
  const address = str(p.address, 300);
  const hotel = str(p.hotel, 150);
  const comment = str(p.comment, 500);
  // Координаты из подсказок; вне Дананга или битые — всё сбрасываем (адрес остаётся текстом).
  const geoOk = inDanang(Number(p.lat), Number(p.lng));
  const place_id = geoOk ? str(p.place_id, 300) || null : null;
  const lat = geoOk ? Number(p.lat) : null;
  const lng = geoOk ? Number(p.lng) : null;
  const lang = ['ua', 'ru', 'en', 'vi'].includes(p.lang) ? p.lang : null;
  const qty = Number(p.portions);
  who.phone = /^\+84\d{9}$/.test(phone) ? phone : null;
  who.telegram = telegram.toLowerCase().replace(/^https?:\/\/(www\.)?t\.me\//, '').replace(/^t\.me\//, '').replace(/^@/, '').slice(0, 64) || null;

  if (!type || !payment) return fail('bad_request');
  if (!telegram) return fail('telegram_required');
  if (!/^\+84\d{9}$/.test(phone)) return fail('phone_invalid');
  if (!address) return fail('address_required');
  if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) return fail('bad_portions');

  const today = todayISO();
  // VIP (вошёл через Telegram): окно начинается с сегодняшнего дня, без ограничения по времени; воскресенье — нельзя.
  const window = Array.from({ length: WINDOW_DAYS }, (_, i) => addDays(today, i + (vip ? 0 : 1))).filter((d) => !isSunday(d));
  const days: string[] = Array.isArray(p.days) ? [...new Set<string>(p.days.map(String))].sort() : [];
  const allowed = new Set(type === 'single' ? window.slice(0, BOOKABLE_DAYS) : window);
  if (days.length < 1 || !days.every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && allowed.has(d))) return fail('bad_days');
  if (type === 'subscription' && days.length < SUB_MIN_DAYS) return fail('bad_days');

  let shot: File | null = null;
  if (payment !== 'cash') {
    const f = form.get('screenshot');
    if (!(f instanceof File) || f.size === 0) return fail('screenshot_required');
    if (f.size > MAX_FILE) return fail('screenshot_size');
    const kind = await detectImage(f); // по сигнатуре файла, не по расширению и Content-Type
    if (!kind) return fail('screenshot_type');
    shot = new File([f], kind === 'png' ? 'payment.png' : 'payment.jpg', { type: kind === 'png' ? 'image/png' : 'image/jpeg' });
  }

  // ── лимиты: считаем только принятые заказы ──
  const since = (ms: number) => new Date(Date.now() - ms).toISOString();
  const okCount = async (col: 'ip_hash' | 'phone' | 'telegram', val: string | null, ms: number) =>
    val ? ((await db.from('order_attempts').select('id', { count: 'exact', head: true }).eq('outcome', 'ok').eq(col, val).gte('created_at', since(ms))).count ?? 0) : 0;
  const [byIp, byPhone, byTg] = await Promise.all([
    okCount('ip_hash', ipHash, RATE_IP.windowMin * 60_000),
    okCount('phone', who.phone, RATE_CONTACT.windowH * 3600_000),
    okCount('telegram', who.telegram, RATE_CONTACT.windowH * 3600_000),
  ]);
  if (byIp >= RATE_IP.max || byPhone >= RATE_CONTACT.max || byTg >= RATE_CONTACT.max) return fail('rate_limited', 429);

  // ── Turnstile: проверяем после валидации, чтобы токен не сгорал на ошибках формы ──
  if (!(await verifyTurnstile(str(p.captcha, 4096), ip))) return fail('captcha_failed', 403);

  // ── цена: только из settings ──
  const { data: settings, error: sErr } = await db.from('settings').select('key, value').in('key', ['price_single', 'price_subscription', 'delivery_single']);
  if (sErr || !settings) {
    console.error('settings error', sErr?.message);
    return fail('server_error', 500);
  }
  const price = Object.fromEntries(settings.map((s) => [s.key, Number(s.value)]));
  if (!(price.price_single > 0) || !(price.price_subscription > 0)) {
    console.error('settings: prices missing');
    return fail('server_error', 500);
  }
  if (!(price.delivery_single >= 0)) {
    console.error('settings: delivery fees missing');
    return fail('server_error', 500);
  }
  // Доставка — за каждый день доставки (не за порцию), для разового и для подписки. Обед в подписке = цена за 5 дней / 5.
  const unit = type === 'single' ? price.price_single : Math.round(price.price_subscription / SUB_MIN_DAYS);
  const food = days.length * qty * unit;
  const delivery_total = days.length * price.delivery_single;
  const total = food + delivery_total;

  // ── сохраняем заказ (номер выдаёт БД) ──
  const { data: order, error: oErr } = await db
    .from('orders')
    .insert({
      type,
      telegram,
      phone,
      address,
      place_id,
      lat,
      lng,
      hotel: hotel || null,
      comment: comment || null,
      payment_method: payment,
      qty,
      total,
      delivery_total,
      lang,
      customer_id: customer?.user_id ?? null,
      is_vip: vip,
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
  const row: OrderRow = { order_number: order.order_number, type, telegram, phone, address, place_id, lat, lng, hotel: hotel || null, comment: comment || null, payment_method: payment, qty, total, delivery_total, lang, is_vip: vip };
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
    if (shot && plainLength(text) <= 1024) {
      const r = await tg('sendPhoto', photoForm({ caption: text, parse_mode: 'HTML', reply_markup: JSON.stringify(keyboardNew(order.order_number)) }));
      if (r.ok) {
        messageId = r.result.message_id;
        fileId = pickFileId(r.result);
      } else console.error(`telegram sendPhoto failed for ${order.order_number}:`, r.description);
    } else {
      const r = await tg('sendMessage', { chat_id, text, parse_mode: 'HTML', reply_markup: keyboardNew(order.order_number), disable_web_page_preview: true });
      if (r.ok) {
        messageId = r.result.message_id;
        if (shot) {
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

  // Запоминаем контакты клиента для автозаполнения (только у вошедшего через Telegram).
  if (customer) {
    const { error } = await db.from('customers').update({ phone, address, place_id, lat, lng }).eq('user_id', customer.user_id);
    if (error) console.error(`save customer profile failed for ${order.order_number}:`, error.message);
  }

  await record('ok', order.order_number);
  return json({ ok: true, orderNumber: order.order_number });
});
