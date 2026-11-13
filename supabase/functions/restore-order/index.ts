import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsFor } from '../_shared/cors.ts';
import { notifyRestored } from '../_shared/restore-notice.ts';
import '../_shared/redact.ts';

/**
 * Восстановление отменённого заказа из админки (verify_jwt = true, админство проверяется внутри; viewer → forbidden).
 * RPC `admin_restore_order` (is_admin() внутри): статус → «подтверждён», запись в order_edits (kind = restore); только заказы, у которых есть недоставленные дни не раньше сегодня.
 * Потом в Orders: исходное сообщение обновляется строкой «♻️ Відновлено — @кто, время» (язык заказа), ответом — та же строка. Ошибка Telegram восстановление не откатывает.
 * Тело: { id: uuid заказа }.
 */
const ERRORS: Record<string, number> = { forbidden: 403, not_found: 404, not_cancelled: 409, no_future_days: 409, bad_request: 400 };

Deno.serve(async (req) => {
  const cors = corsFor(req.headers.get('origin'));
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json({ ok: false, code: 'bad_request' }, 405);

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('authorization') ?? '' } },
    auth: { persistSession: false },
  });
  const { data: isAdmin, error: adminErr } = await db.rpc('is_admin');
  if (adminErr || isAdmin !== true) return json({ ok: false, code: 'forbidden' }, 403);

  let id = '';
  try {
    const b = await req.json();
    id = typeof b?.id === 'string' ? b.id : '';
  } catch { /* пусто */ }
  if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ ok: false, code: 'bad_request' }, 400);

  const { data, error } = await db.rpc('admin_restore_order', { p_order: id });
  if (error) {
    const code = Object.keys(ERRORS).find((c) => error.message.includes(c)) ?? 'server_error';
    if (code === 'server_error') console.error('restore-order rpc failed:', error.message);
    return json({ ok: false, code }, ERRORS[code] ?? 500);
  }
  const r = data as { order_number: string; by: string };
  const telegram = await notifyRestored(db, r.order_number, r.by);
  return json({ ok: true, telegram, order_number: r.order_number });
});
