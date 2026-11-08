import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsFor } from '../_shared/cors.ts';
import { geocodeAddress } from '../_shared/geocode.ts';
import { expandMapsLink } from '../_shared/maps-link.ts';
import { parsePoint } from '../_shared/point.ts';

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
    const r = await expandMapsLink(input);
    hit = r.point ?? (r.query ? await geocodeAddress(r.query) : null); // короткая ссылка может вести на ?q=<адрес> без координат
  }
  return hit ? json({ ok: true, lat: hit.lat, lng: hit.lng }) : json({ ok: false, code: 'not_found' }, 422);
});
