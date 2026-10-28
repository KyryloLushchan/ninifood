import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsFor } from '../_shared/cors.ts';
import { addDays, isSunday, todayISO } from '../_shared/dates.ts';
import { inDanang } from '../_shared/danang.ts';
import { clientIp, sha256hex, verifyTurnstile } from '../_shared/security.ts';

const WINDOW_DAYS = 14;
const BOOKABLE_DAYS = 6;
const SUB_MIN_DAYS = 5;
const MAX_QTY = 99;
const MAX_BODY = 20_000;
const RATE_PER_HOUR = 10; // черновиков с одного IP в час
const ID_RE = /^[0-9A-Za-z]{22}$/;
const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** 22 символа base62 (~131 бит) из crypto; байты ≥ 248 отбрасываем, чтобы не было смещения. */
function newId(): string {
  let out = '';
  while (out.length < 22) {
    for (const b of crypto.getRandomValues(new Uint8Array(32))) {
      if (b < 248 && out.length < 22) out += ALPHABET[b % 62];
    }
  }
  return out;
}

/**
 * Черновик заказа (без цены и скриншота) для перехода с компьютера на телефон.
 * POST {action: 'create', payload..., captcha} → {ok, id} | {action: 'get', id} → {ok, draft}.
 * Содержимое черновика в логи не пишем.
 */
Deno.serve(async (req) => {
  const cors = corsFor(req.headers.get('origin'));
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json({ ok: false, code: 'bad_request' }, 405);
  if (Number(req.headers.get('content-length') ?? 0) > MAX_BODY) return json({ ok: false, code: 'bad_request' }, 413);

  let p: any;
  try {
    p = await req.json();
  } catch {
    return json({ ok: false, code: 'bad_request' }, 400);
  }
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

  if (p?.action === 'get') {
    const id = String(p.id ?? '');
    if (!ID_RE.test(id)) return json({ ok: false, code: 'not_found' }, 404);
    const { data, error } = await db.from('order_drafts').select('payload').eq('id', id).gt('expires_at', new Date().toISOString()).maybeSingle();
    if (error) {
      console.error('order-draft get failed:', error.message);
      return json({ ok: false, code: 'server_error' }, 500);
    }
    return data ? json({ ok: true, draft: data.payload }) : json({ ok: false, code: 'not_found' }, 404);
  }
  if (p?.action !== 'create') return json({ ok: false, code: 'bad_request' }, 400);

  // ── валидация (как в send-order, но без скриншота; цену не храним) ──
  const type = p.type === 'once' || p.type === 'single' ? 'single' : p.type === 'sub' || p.type === 'subscription' ? 'subscription' : null;
  const payment = p.payment === 'qr' || p.payment === 'cash' || p.payment === 'other' ? p.payment : null;
  const telegram = str(p.telegram, 64);
  const phone = str(p.phone, 32).replace(/[\s-]/g, '');
  const address = str(p.address, 300);
  const qty = Number(p.portions);
  if (!type || !payment) return json({ ok: false, code: 'bad_request' }, 400);
  if (!telegram) return json({ ok: false, code: 'telegram_required' }, 400);
  if (!/^\+84\d{9}$/.test(phone)) return json({ ok: false, code: 'phone_invalid' }, 400);
  if (!address) return json({ ok: false, code: 'address_required' }, 400);
  if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) return json({ ok: false, code: 'bad_portions' }, 400);

  // Окно с сегодняшнего дня (VIP видит сегодня); точную проверку по правам всё равно делает send-order.
  const today = todayISO();
  const window = Array.from({ length: WINDOW_DAYS }, (_, i) => addDays(today, i)).filter((d) => !isSunday(d));
  const allowed = new Set(window);
  const days: string[] = Array.isArray(p.days) ? [...new Set<string>(p.days.map(String))].sort() : [];
  if (days.length < 1 || days.length > WINDOW_DAYS || !days.every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && allowed.has(d))) return json({ ok: false, code: 'bad_days' }, 400);
  if (type === 'single' && days.length > BOOKABLE_DAYS + 1) return json({ ok: false, code: 'bad_days' }, 400);
  if (type === 'subscription' && days.length < SUB_MIN_DAYS) return json({ ok: false, code: 'bad_days' }, 400);

  const geoOk = inDanang(Number(p.lat), Number(p.lng));
  const payload = {
    type,
    days,
    portions: qty,
    payment,
    lang: ['ua', 'ru', 'en', 'vi'].includes(p.lang) ? p.lang : null,
    telegram,
    phone,
    address,
    hotel: str(p.hotel, 150),
    comment: str(p.comment, 500),
    place_id: geoOk ? str(p.place_id, 300) || null : null,
    lat: geoOk ? Number(p.lat) : null,
    lng: geoOk ? Number(p.lng) : null,
  };

  const ip = clientIp(req);
  const ipHash = ip ? await sha256hex(`${Deno.env.get('IP_HASH_SALT') ?? ''}:${ip}`) : null;
  if (ipHash) {
    const since = new Date(Date.now() - 3600_000).toISOString();
    const { count } = await db.from('order_drafts').select('id', { count: 'exact', head: true }).eq('ip_hash', ipHash).gte('created_at', since);
    if ((count ?? 0) >= RATE_PER_HOUR) return json({ ok: false, code: 'rate_limited' }, 429);
  }
  if (!(await verifyTurnstile(str(p.captcha, 4096), ip))) return json({ ok: false, code: 'captcha_failed' }, 403);

  const id = newId();
  const { error } = await db.from('order_drafts').insert({ id, payload, ip_hash: ipHash });
  if (error) {
    console.error('order-draft insert failed:', error.message);
    return json({ ok: false, code: 'server_error' }, 500);
  }
  return json({ ok: true, id });
});
