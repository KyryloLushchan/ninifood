import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsFor } from '../_shared/cors.ts';
import { isGoogleHost, parsePoint } from '../_shared/point.ts';

const MAX_HOPS = 5;

/**
 * Админка: «Указать точку». Принимает «lat, lng» или ссылку Google Maps (в т.ч. короткую maps.app.goo.gl — разворачиваем здесь,
 * переходы только по google-доменам) и возвращает координаты в пределах Дананга. Вызывать может только админ.
 */
Deno.serve(async (req) => {
  const cors = corsFor(req.headers.get('origin'));
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json({ ok: false, code: 'bad_request' }, 405);

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('authorization') ?? '' } },
    auth: { persistSession: false },
  });
  const { data: isAdmin, error } = await db.rpc('is_admin');
  if (error || isAdmin !== true) return json({ ok: false, code: 'forbidden' }, 403);

  let input = '';
  try {
    const b = await req.json();
    input = typeof b?.input === 'string' ? b.input.trim().slice(0, 2000) : '';
  } catch { /* пусто */ }
  if (!input) return json({ ok: false, code: 'bad_request' }, 400);

  let hit = parsePoint(input);
  if (!hit && /^https?:\/\//i.test(input)) {
    let url = input;
    try {
      for (let hop = 0; hop < MAX_HOPS && !hit; hop++) {
        const u = new URL(url);
        if (u.protocol !== 'https:' || !isGoogleHost(u.hostname)) break;
        const res = await fetch(u, { redirect: 'manual', signal: AbortSignal.timeout(5000), headers: { 'user-agent': 'Mozilla/5.0 (compatible; NiniFood/1.0)' } });
        const loc = res.headers.get('location');
        if (loc) {
          url = new URL(loc, u).toString();
          hit = parsePoint(url);
          continue;
        }
        // Конечная страница: координаты могут быть только в теле (@lat,lng).
        const m = /@(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/.exec((await res.text()).slice(0, 500_000));
        hit = m ? parsePoint(`@${m[1]},${m[2]}`) : null;
        break;
      }
    } catch (e) {
      console.error('resolve-point fetch failed:', (e as Error).message);
    }
  }
  return hit ? json({ ok: true, lat: hit.lat, lng: hit.lng }) : json({ ok: false, code: 'not_found' }, 422);
});
