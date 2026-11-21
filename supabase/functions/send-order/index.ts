import { discountAmount } from '../_shared/discount.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { addDays, isSunday, todayISO } from '../_shared/dates.ts';
import { loadLastDay } from '../_shared/last-day.ts';
import { loadClosedDays } from '../_shared/closed-days.ts';
import { ordersPaused } from '../_shared/orders-paused.ts';
import { inDanang } from '../_shared/danang.ts';
import { resolveOrderPoint } from '../_shared/maps-link.ts';
import { buildOrderText, getDeliveryHours, keyboardNew, plainLength, type OrderRow } from '../_shared/order-text.ts';
import { corsFor } from '../_shared/cors.ts';
import { clientIp, detectImage, sha256hex, verifyTurnstile } from '../_shared/security.ts';
import { esc, tg } from '../_shared/telegram.ts';
import { errMsg } from '../_shared/redact.ts';

const BOOKABLE_DAYS = 6; // как на фронте: ближайшие 6 доступных дней для разового заказа
const WINDOW_DAYS = 14; // окно для подписки
const SUB_MIN_DAYS = 5; // подписка: от 5 дней; обед = price_subscription / 5
const MAX_QTY = 99;
const MAX_FILE = 5 * 1024 * 1024;
const RATE_IP = { max: 3, windowMin: 10 }; // заказов с одного IP за 10 минут
const RATE_CONTACT = { max: 5, windowH: 24 }; // заказов с одного телефона / Telegram за сутки
const ALERT_THRESHOLD = 20; // заказов или ошибок за час → «подозрительная активность»
const SALT = Deno.env.get('IP_HASH_SALT') ?? '';
const TG_BUDGET_MS = 15_000; // сколько ждём отправку в Telegram, прежде чем ответить клиенту

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
  // Ключ запроса (uuid из заголовка x-request-id): один ключ = один заказ; повтор после обрыва возвращает уже созданный заказ.
  const rid = (req.headers.get('x-request-id') ?? '').trim().toLowerCase();
  const requestId: string | null = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(rid) ? rid : null;

  // Каждая попытка пишется в order_attempts: по ней — лимиты и мониторинг (>20 заказов/ошибок за час → алерт в группу).
  const record = async (outcome: string, orderNumber?: string) => {
    try {
      const { error } = await db.from('order_attempts').insert({ ip_hash: ipHash, phone: who.phone, telegram: who.telegram, country, outcome, order_number: orderNumber ?? null, request_id: requestId });
      if (error) console.error('order_attempts insert failed:', error.message);
      await checkAlerts();
    } catch (e) {
      console.error('record attempt error:', errMsg(e));
    }
  };
  const checkAlerts = async () => {
    const since = new Date(Date.now() - 3600_000).toISOString();
    const count = async (ok: boolean) => {
      const q = db.from('order_attempts').select('id', { count: 'exact', head: true }).gte('created_at', since);
      return (await (ok ? q.eq('outcome', 'ok') : q.neq('outcome', 'ok').neq('outcome', 'received'))).count ?? 0;
    };
    const [orders, errors] = await Promise.all([count(true), count(false)]);
    for (const [kind, n, what] of [['orders_spike', orders, 'заказов'], ['errors_spike', errors, 'ошибок send-order']] as const) {
      if (n <= ALERT_THRESHOLD) continue;
      // Не чаще раза в час на вид: обновление проходит только у того, кто первым сдвинул last_sent_at.
      const { data } = await db.from('security_alerts').update({ last_sent_at: new Date().toISOString() }).eq('kind', kind).lt('last_sent_at', since).select('kind');
      if (data?.length) await tg('sendMessage', { chat_id: Deno.env.get('ORDERS_CHAT_ID')!, text: `⚠️ <b>Подозрительная активность</b>\nЗа последний час ${n} ${esc(what)} (порог ${ALERT_THRESHOLD}).`, parse_mode: 'HTML' });
    }
  };
  // «received»: запрос дошёл до функции (до разбора тела) — по строке без финала видно обрыв загрузки/падение. Алерты её не считают.
  try {
    const { error } = await db.from('order_attempts').insert({ ip_hash: ipHash, country, outcome: 'received', request_id: requestId });
    if (error) console.error('order_attempts received insert failed:', error.message);
  } catch (e) {
    console.error('record received error:', errMsg(e));
  }
  const fail = async (code: string, status = 400) => {
    await record(code);
    return json({ ok: false, code }, status);
  };

  // Тело больше файла + текстовых полей не разбираем вообще.
  if (Number(req.headers.get('content-length') ?? 0) > Math.ceil((MAX_FILE * 4) / 3) + 200_000) return fail('screenshot_size', 413);

  // Основной формат — multipart (payload + файл screenshot). Запасной — application/json { payload, screenshot: base64 }:
  // для WebView, где загрузка файла через FormData обрывается ещё на клиенте (Failed to fetch). Дальше логика одна и та же.
  let form: FormData | null = null;
  let p: any;
  let jsonShot: File | null = null;
  if ((req.headers.get('content-type') ?? '').toLowerCase().includes('application/json')) {
    try {
      const j = await req.json();
      p = typeof j?.payload === 'string' ? JSON.parse(j.payload) : j?.payload;
      if (typeof j?.screenshot === 'string' && j.screenshot.length > 0 && j.screenshot.length <= Math.ceil((MAX_FILE * 4) / 3) + 8) {
        const bin = atob(j.screenshot);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        jsonShot = new File([bytes], 'payment.jpg');
      }
    } catch {
      return fail('bad_request');
    }
    if (!p || typeof p !== 'object') return fail('bad_request');
  } else {
    try {
      form = await req.formData();
      p = JSON.parse(String(form.get('payload') ?? ''));
    } catch {
      return fail('bad_request');
    }
  }

  // ── повтор с тем же ключом: заказ уже создан → возвращаем его номер (без капчи, лимитов и второго заказа) ──
  if (requestId) {
    const { data: prev } = await db.from('orders').select('id, order_number, created_at').eq('request_id', requestId).maybeSingle();
    if (prev) {
      const { count } = await db.from('order_days').select('order_id', { count: 'exact', head: true }).eq('order_id', prev.id);
      if (count) {
        console.log(`replay request ${requestId} → ${prev.order_number}`);
        return json({ ok: true, orderNumber: prev.order_number });
      }
      // заказ без дней — недоделанный остаток упавшего запроса: старше 30 с удаляем и создаём заново, моложе — просим повторить позже
      if (Date.now() - new Date(prev.created_at).getTime() < 30_000) return fail('server_error', 500);
      await db.from('orders').delete().eq('id', prev.id);
    }
  }

  // ── пауза приёма заказов (Настройки → «Приём заказов»): новые не принимаем, повтор уже созданного — выше ──
  if (await ordersPaused(db)) return json({ ok: false, code: 'orders_paused' }, 503);

  // ── вход по email: JWT пользователя (anon-ключ — гость). VIP — только по email из JWT (auth.getUser), не по полям формы. ──
  let customerId: string | null = null;
  let vip = false;
  let discountPercent = 0;
  const jwt = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (jwt && jwt !== Deno.env.get('SUPABASE_ANON_KEY')) {
    const { data } = await db.auth.getUser(jwt);
    const email = (data.user?.email ?? '').toLowerCase();
    // Аккаунт «только просмотр» (viewer) заказов не создаёт.
    if (data.user && (await db.from('viewers').select('user_id').eq('user_id', data.user.id).maybeSingle()).data) return json({ ok: false, code: 'forbidden' }, 403); // без записи в order_attempts: ничего не меняем
    if (data.user && email) {
      customerId = data.user.id;
      vip = !!(await db.from('vip_customers').select('id').eq('email', email).maybeSingle()).data;
      // Персональная скидка: только по email из JWT, действующая (valid_until пусто или ≥ сегодня по Дананг-времени).
      const { data: d } = await db.from('customer_discounts').select('percent').eq('email', email).or(`valid_until.is.null,valid_until.gte.${todayISO()}`).maybeSingle();
      discountPercent = Math.min(100, Math.max(0, Number(d?.percent) || 0));
    }
  }

  // ── валидация ──
  const type = p.type === 'once' || p.type === 'single' ? 'single' : p.type === 'sub' || p.type === 'subscription' ? 'subscription' : null;
  const payment = p.payment === 'qr' || p.payment === 'cash' || p.payment === 'other' ? p.payment : null;
  const telegram = str(p.telegram, 64);
  let phone = str(p.phone, 32).replace(/[\s-]/g, '');
  // Ссылка продления (?r=КОД): телефон на странице показан маской — если клиент его не менял, подставляем полный номер из прошлого заказа по коду.
  const renewalCode = /^[0-9A-Za-z]{22}$/.test(String(p.renewal ?? '')) ? String(p.renewal) : null;
  if (renewalCode && !phone) {
    const { data: rl } = await db.from('renewal_links').select('orders!inner(phone)').eq('code', renewalCode).is('used_at', null).gt('expires_at', new Date().toISOString()).maybeSingle();
    phone = String((rl as any)?.orders?.phone ?? '');
  }
  let address = str(p.address, 300);
  const hotel = str(p.hotel, 150);
  const comment = str(p.comment, 500);
  // Координаты из подсказок; вне Дананга или битые — всё сбрасываем (адрес остаётся текстом).
  const geoOk = inDanang(Number(p.lat), Number(p.lng));
  const place_id = geoOk ? str(p.place_id, 300) || null : null;
  let lat: number | null = geoOk ? Number(p.lat) : null;
  let lng: number | null = geoOk ? Number(p.lng) : null;
  const lang = ['ua', 'ru', 'en', 'vi'].includes(p.lang) ? (p.lang === 'vi' ? 'en' : p.lang) : null;
  const cutlery = p.cutlery === true; // одноразовые приборы (бесплатно), одно значение на все дни
  // Источник рекламы (ссылка с ?s=код): формат ^[a-z0-9-]{1,40}$, иначе игнорируем.
  const srcOk = (v: unknown) => (typeof v === 'string' && /^[a-z0-9-]{1,40}$/.test(v) ? v : null);
  const source_first = srcOk(p.source_first);
  const source_last = srcOk(p.source_last);
  const visitorId = typeof p.visitor_id === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(p.visitor_id) ? p.visitor_id : null;
  const qty = Number(p.portions);
  who.phone = /^\+84\d{9}$/.test(phone) ? phone : null;
  who.telegram = telegram.toLowerCase().replace(/^https?:\/\/(www\.)?t\.me\//, '').replace(/^t\.me\//, '').replace(/^@/, '').slice(0, 64) || null;

  if (!type || !payment) return fail('bad_request');
  if (!telegram) return fail('telegram_required');
  if (!/^\+84\d{9}$/.test(phone)) return fail('phone_invalid');
  if (!address) return fail('address_required');
  if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) return fail('bad_portions');

  const today = todayISO();
  // VIP (вошёл по email из списка): окно начинается с сегодняшнего дня, без ограничения по времени; воскресенье — нельзя.
  const closed = await loadClosedDays(db); // «Закрытые дни»: на них заказать нельзя
  const lastDay = await loadLastDay(db); // «Последний день доставки»: дни позже него не принимаем, даже в обход сайта
  const window = Array.from({ length: WINDOW_DAYS }, (_, i) => addDays(today, i + (vip ? 0 : 1))).filter((d) => !isSunday(d) && !closed.has(d) && (!lastDay || d <= lastDay));
  const days: string[] = Array.isArray(p.days) ? [...new Set<string>(p.days.map(String))].sort() : [];
  const allowed = new Set(type === 'single' ? window.slice(0, BOOKABLE_DAYS) : window);
  if (days.length < 1 || !days.every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && allowed.has(d))) return fail('bad_days');
  if (type === 'subscription' && days.length < Math.min(SUB_MIN_DAYS, window.length)) return fail('bad_days'); // в конце срока — только оставшиеся дни (меньше 5)

  let shot: File | null = null;
  if (payment !== 'cash') {
    const f = form ? form.get('screenshot') : jsonShot;
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

  // ── адрес без точки (текстом, без выбора подсказки): геокодируем на сервере, чтобы заказ попал в маршрут курьера ──
  if (lat === null || lng === null) {
    // Ссылка Google Maps в адресе → точка и человеческий адрес; текст → геокодирование; не вышло — заказ всё равно принимается (в Orders пометка «адрес без точки»).
    const r = await resolveOrderPoint(address);
    address = r.address;
    lat = r.lat;
    lng = r.lng;
  }

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
  const discount_amount = discountAmount(food, discountPercent);
  const discount_percent = discount_amount > 0 ? discountPercent : 0;
  const total = food - discount_amount + delivery_total; // скидка только на обеды

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
      discount_percent,
      discount_amount,
      lang,
      cutlery,
      customer_id: customerId,
      is_vip: vip,
      source_first,
      source_last,
      request_id: requestId,
    })
    .select('id, order_number')
    .single();
  if (oErr?.code === '23505' && requestId) {
    // параллельный запрос с тем же ключом успел раньше — отдаём его заказ
    const { data: dup } = await db.from('orders').select('order_number').eq('request_id', requestId).maybeSingle();
    if (dup) return json({ ok: true, orderNumber: dup.order_number });
  }
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

  // Воронка рекламы: шаг «создан заказ» (сервер пишет сам; ошибка записи на заказ не влияет).
  const adCode = source_last ?? source_first;
  if (adCode && visitorId) {
    const { error } = await db.from('ad_visits').insert({ code: adCode, visitor_id: visitorId, page: '/', step: 'order_created' });
    if (error) console.error(`ad_visits insert failed for ${order.order_number}:`, error.message);
  }

  // Копия скриншота в закрытом бакете: если отправка в Telegram сорвётся, tg-resend досылет заказ вместе со скриншотом (после успеха объект удаляется).
  let receiptPath: string | null = null;
  if (shot) {
    const path = `${order.id}.${shot.type === 'image/png' ? 'png' : 'jpg'}`;
    const { error: upErr } = await db.storage.from('pending-receipts').upload(path, shot, { contentType: shot.type, upsert: true });
    if (upErr) console.error(`receipt backup failed for ${order.order_number}:`, upErr.message);
    else {
      receiptPath = path;
      await db.from('orders').update({ receipt_path: path }).eq('id', order.id);
    }
  }

  // ── Telegram ──
  const row: OrderRow = { order_number: order.order_number, type, telegram, phone, address, place_id, lat, lng, hotel: hotel || null, comment: comment || null, payment_method: payment, qty, total, delivery_total, discount_percent, discount_amount, lang, cutlery, is_vip: vip };
  const text = buildOrderText(row, days, undefined, await getDeliveryHours(db));
  const chat_id = Deno.env.get('ORDERS_CHAT_ID')!;
  // Отправка в Telegram — с бюджетом 15 с (TG_BUDGET_MS): не успела — клиенту сразу успех, отправка доезжает в фоне (waitUntil и пишет id сообщения сама),
  // а если и так не ушла — досылает cron tg-resend (он не трогает заказы моложе 2 минут, так что с фоновой отправкой не пересекается).
  const tgWork = (async () => {
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
      console.error(`telegram error for ${order.order_number}:`, errMsg(e));
    }

    if (messageId !== null || fileId !== null) {
      const { error } = await db.from('orders').update({ tg_message_id: messageId, receipt_file_id: fileId, receipt_path: null }).eq('id', order.id);
      if (error) console.error(`update tg ids failed for ${order.order_number}:`, error.message);
      if (receiptPath && messageId !== null) await db.storage.from('pending-receipts').remove([receiptPath]);
    } else {
      console.error(`order ${order.order_number} saved but NOT delivered to Telegram (tg_message_id = null)`);
    }

  })().catch((e) => console.error(`telegram step failed for ${order.order_number}:`, errMsg(e)));
  let budgetTimer: ReturnType<typeof setTimeout> | undefined;
  const tgDone = await Promise.race([tgWork.then(() => true), new Promise<boolean>((r) => (budgetTimer = setTimeout(() => r(false), TG_BUDGET_MS)))]);
  clearTimeout(budgetTimer);
  if (!tgDone) {
    console.warn(`telegram is slow for ${order.order_number} (> ${TG_BUDGET_MS} ms): answering success, sending continues in background; tg-resend will deliver if it fails`);
    (globalThis as any).EdgeRuntime?.waitUntil?.(tgWork);
  }

  // Запоминаем контакты клиента для автозаполнения (только у вошедшего).
  if (customerId) {
    const { error } = await db.from('customers').update({ telegram, phone, address, place_id, lat, lng, cutlery }).eq('user_id', customerId);
    if (error) console.error(`save customer profile failed for ${order.order_number}:`, error.message);
  }

  // Заказ ушёл с телефона по ссылке «Продолжить на телефоне» — черновик больше не нужен.
  // Код продления одноразовый: после оформления заказа больше не работает.
  if (renewalCode) {
    const { error } = await db.from('renewal_links').update({ used_at: new Date().toISOString(), used_order_id: order.id }).eq('code', renewalCode).is('used_at', null);
    if (error) console.error(`mark renewal used failed for ${order.order_number}:`, error.message);
  }
  const draftId = str(p.draft_id, 22);
  if (/^[0-9A-Za-z]{22}$/.test(draftId)) {
    const { error } = await db.from('order_drafts').delete().eq('id', draftId);
    if (error) console.error(`delete draft failed for ${order.order_number}:`, error.message);
  }

  await record('ok', order.order_number);
  return json({ ok: true, orderNumber: order.order_number });
});
