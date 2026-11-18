import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsFor } from '../_shared/cors.ts';
import { loadSpecialNotes, routePlanFromRows, specialNoteLine } from '../_shared/client-notes.ts';
import { loadDayPlan, loadDayRows } from '../_shared/day-plan.ts';
import { isSunday, labelRu, todayISO } from '../_shared/dates.ts';
import { esc, tg } from '../_shared/telegram.ts';
import { errMsg } from '../_shared/redact.ts';

/**
 * Админка: постоянный комментарий клиента добавлен/изменён. Ночной отчёт «Порции на …» (00:00 Дананг) за сегодня уже ушёл,
 * поэтому если у клиента СЕГОДНЯ есть доставка — шлём пометку отдельным сообщением в NiniFood Ops (KITCHEN_CHAT_ID).
 * Тело: { order_id }. Доступ: только админ (JWT). Нет доставки сегодня / воскресенье / нет комментария — ничего не отправляется.
 */
Deno.serve(async (req) => {
  const cors = corsFor(req.headers.get('origin'));
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json({ ok: false, code: 'bad_request' }, 405);
  const anon = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('authorization') ?? '' } }, auth: { persistSession: false } });
  const { data: isAdmin, error } = await anon.rpc('is_admin');
  if (error || isAdmin !== true) return json({ ok: false, code: 'forbidden' }, 403);

  let orderId = '';
  try {
    const b = await req.json();
    orderId = typeof b?.order_id === 'string' ? b.order_id : '';
  } catch { /* пусто */ }
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) return json({ ok: false, code: 'bad_request' }, 400);

  const date = todayISO();
  if (isSunday(date)) return json({ ok: true, skipped: 'sunday' });
  const chat = Deno.env.get('KITCHEN_CHAT_ID') ?? '';
  if (!chat) return json({ ok: false, code: 'kitchen_chat_missing' }, 500);
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  try {
    const { data: mine } = await db.rpc('client_kitchen_notes_for', { p_orders: [orderId] });
    const noteId = mine?.[0]?.note_id;
    if (noteId == null) return json({ ok: true, skipped: 'no_note' });
    const day = await loadDayRows(db, date);
    if (day.error) return json({ ok: false, code: 'server_error' }, 500);
    const p = await loadDayPlan(db, date, day.rows);
    const all = await loadSpecialNotes(db, day.rows, routePlanFromRows(p));
    const list = all.filter((s) => s.noteId === Number(noteId));
    if (!list.length) return json({ ok: true, skipped: 'no_delivery_today' });
    const text = `📝 <b>Особая пометка на ${esc(labelRu(date).replace(' ', ', '))}</b> (добавлена после отчёта)\n${list.map(specialNoteLine).join('\n')}`;
    const r = await tg('sendMessage', { chat_id: chat, text, parse_mode: 'HTML', disable_web_page_preview: true });
    if (!r.ok) {
      console.error('kitchen-note-notify telegram failed:', r.description);
      return json({ ok: false, code: 'telegram_failed' }, 502);
    }
    return json({ ok: true, sent: list.length });
  } catch (e) {
    console.error('kitchen-note-notify failed:', errMsg(e));
    return json({ ok: false, code: 'server_error' }, 500);
  }
});
