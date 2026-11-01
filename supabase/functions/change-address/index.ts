import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsFor } from '../_shared/cors.ts';
import { inDanang } from '../_shared/danang.ts';
import { geocodeAddress } from '../_shared/geocode.ts';
import { esc, tg } from '../_shared/telegram.ts';

/**
 * Смена адреса доставки из админки (у заказа и, по галочке, у других активных заказов того же клиента) — меняются только заказы
 * с будущими недоставленными днями. Работу в БД делает RPC admin_change_address от имени вызывающего (is_admin() внутри, журнал order_edits);
 * здесь — координаты (из подсказки Google или серверное геокодирование) и уведомление в группу Orders ответом на сообщение каждого заказа.
 */
const ERRORS: Record<string, number> = { forbidden: 403, not_found: 404, order_not_active: 409, no_future_days: 409, other_client: 400, bad_address: 400, bad_comment: 400, bad_request: 400 };
const short = (s: string) => (s.length > 120 ? `${s.slice(0, 117)}…` : s);

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

  const uuid = /^[0-9a-f-]{36}$/i;
  let id = '';
  let address = '';
  let placeId: string | null = null;
  let lat: number | null = null;
  let lng: number | null = null;
  let comment: string | null = null;
  let hotel: string | null = null;
  let also: string[] = [];
  try {
    const b = await req.json();
    id = typeof b?.id === 'string' ? b.id : '';
    address = typeof b?.address === 'string' ? b.address.trim() : '';
    placeId = typeof b?.place_id === 'string' && b.place_id.length <= 300 ? b.place_id : null;
    lat = typeof b?.lat === 'number' ? b.lat : null;
    lng = typeof b?.lng === 'number' ? b.lng : null;
    comment = typeof b?.comment === 'string' ? b.comment : null;
    hotel = typeof b?.hotel === 'string' ? b.hotel : null;
    also = Array.isArray(b?.also) ? b.also.filter((x: unknown) => typeof x === 'string' && uuid.test(x)).slice(0, 20) : [];
  } catch { /* пусто */ }
  if (!uuid.test(id) || address.length < 5 || address.length > 300) return json({ ok: false, code: 'bad_request' }, 400);

  // Координаты: из подсказки Google (внутри Дананга) или серверное геокодирование текста; не нашли — адрес остаётся текстом без точки.
  if (lat !== null && lng !== null && inDanang(lat, lng)) {
    /* точка из подсказки */
  } else {
    lat = lng = null;
    placeId = null;
    const g = await geocodeAddress(address);
    if (g) ({ lat, lng } = g);
  }

  const { data, error } = await db.rpc('admin_change_address', { p_order: id, p_address: address, p_place_id: placeId, p_lat: lat, p_lng: lng, p_comment: comment, p_hotel: hotel, p_also: also });
  if (error) {
    const code = Object.keys(ERRORS).find((c) => error.message.includes(c)) ?? 'server_error';
    if (code === 'server_error') console.error('change-address rpc failed:', error.message);
    return json({ ok: false, code }, ERRORS[code] ?? 500);
  }
  const r = data as { address: string; orders: { id: string; order_number: string; tg_message_id: number | null; old_address: string; days: string[] }[] };

  let failed = 0;
  for (const o of r.orders) {
    const text = `📍 Изменён адрес ${esc(o.order_number)}: ${esc(short(o.old_address))} → ${esc(short(r.address))}`;
    const res = await tg('sendMessage', {
      chat_id: Deno.env.get('ORDERS_CHAT_ID')!,
      text,
      parse_mode: 'HTML',
      ...(o.tg_message_id ? { reply_to_message_id: o.tg_message_id, allow_sending_without_reply: true } : {}),
    });
    if (!res.ok) {
      failed++;
      console.error(`change-address telegram failed for ${o.order_number}:`, res.description);
    }
  }
  return json({ ok: true, telegram: failed ? 'failed' : 'sent', point: lat !== null, address: r.address, orders: r.orders.map((o) => ({ id: o.id, order_number: o.order_number, days: o.days })) });
});
