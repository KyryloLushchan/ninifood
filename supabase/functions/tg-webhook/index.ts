import { createClient } from 'npm:@supabase/supabase-js@2';
import { nowDanang } from '../_shared/dates.ts';
import { buildPayrollReport, fmtRub, weekDays } from '../_shared/courier-pay.ts';
import { statusLabel } from '../_shared/order-i18n.ts';
import { buildOrderText, getDeliveryHours, keyboardConfirmed, keyboardNone, type OrderRow } from '../_shared/order-text.ts';
import { loadPayroll } from '../_shared/payroll.ts';
import { addExtra, applyNote, courierButton, courierResync, startNote } from '../_shared/courier-route.ts';
import { safeEqual } from '../_shared/security.ts';
import { tg } from '../_shared/telegram.ts';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});
const ADMINS = new Set((Deno.env.get('ADMIN_TG_IDS') ?? '').split(',').map((s) => s.trim()).filter(Boolean));

const ok = () => new Response('ok');

/**
 * Доступ в группе курьера по Telegram user id (не по нику): courier_tg_ids — кнопки маршрута; courier_note_ids — ещё и «📝 Комментарий»; админы (ADMIN_TG_IDS) — всё.
 * Списки лежат в settings (Настройки → Курьеры), не в коде. На права в других группах не влияет.
 */
async function courierAccess() {
  const { data: st } = await db.from('settings').select('key, value').in('key', ['courier_tg_ids', 'courier_note_ids']);
  const list = (k: string) => new Set(String((st ?? []).find((x: any) => x.key === k)?.value ?? '').split(/[\s,;]+/).filter(Boolean));
  const buttons = list('courier_tg_ids');
  const notes = list('courier_note_ids');
  return {
    canButtons: (uid: string) => buttons.has(uid) || notes.has(uid) || ADMINS.has(uid),
    canNote: (uid: string) => notes.has(uid) || ADMINS.has(uid),
  };
}

Deno.serve(async (req) => {
  if (!(await safeEqual(req.headers.get('x-telegram-bot-api-secret-token') ?? '', Deno.env.get('TG_WEBHOOK_SECRET') ?? ''))) {
    return new Response('forbidden', { status: 401 });
  }
  let update: any;
  try {
    update = await req.json();
  } catch {
    return ok();
  }
  // Бот в личке и в чужих группах молчит: личные чаты игнорируются полностью (без ответа и без записи в БД); чужая группа — бот сам выходит (leaveChat) и ничего не делает.
  // Свои группы — Orders, NiniFood Ops, Courier, Renewals (id из секретов).
  const ours = new Set(['ORDERS_CHAT_ID', 'KITCHEN_CHAT_ID', 'COURIER_CHAT_ID', 'RENEWALS_CHAT_ID'].map((k) => Deno.env.get(k) ?? '').filter(Boolean));
  const chat = update.message?.chat ?? update.edited_message?.chat ?? update.callback_query?.message?.chat ?? update.my_chat_member?.chat ?? update.channel_post?.chat ?? null;
  if (chat) {
    if (chat.type === 'private') return ok();
    if (!ours.has(String(chat.id))) {
      // Наша группа стала супергруппой (новый chat_id): запоминаем новый id в settings.extra_chat_ids (чтобы не выйти из своей группы) и просим обновить секрет.
      const from = String(update.message?.migrate_from_chat_id ?? '');
      const { data: ex } = await db.from('settings').select('value').eq('key', 'extra_chat_ids').maybeSingle();
      const extra = String(ex?.value ?? '').split(/[\s,;]+/).filter(Boolean);
      if (from && ours.has(from)) {
        if (!extra.includes(String(chat.id))) await db.from('settings').upsert({ key: 'extra_chat_ids', value: [...extra, String(chat.id)].join(',') }, { onConflict: 'key' });
        await tg('sendMessage', { chat_id: Deno.env.get('ORDERS_CHAT_ID')!, text: `⚠️ Группа «${String(chat.title ?? '').replace(/[<>&]/g, '')}» стала супергруппой: обновите её chat_id в секретах Supabase (ORDERS/KITCHEN/COURIER/RENEWALS_CHAT_ID).`, parse_mode: 'HTML' });
        return ok();
      }
      if (extra.includes(String(chat.id))) return ok(); // свою мигрировавшую группу не покидаем (кнопки в ней не работают, пока секрет не обновлён)
      if (['group', 'supergroup', 'channel'].includes(chat.type)) await tg('leaveChat', { chat_id: chat.id });
      return ok();
    }
    if (update.my_chat_member) return ok(); // изменения членства в наших группах — без действий
  }

  // Ответ на вопрос бота «Напишите комментарий к NF-…» в группе курьера (ForceReply) — комментарий к точке маршрута (админы и id из courier_note_ids).
  if (update.message && !update.callback_query) {
    const m = update.message;
    if (m.reply_to_message) {
      try {
        const acc = await courierAccess();
        if (acc.canNote(String(m.from?.id))) await applyNote(db, m);
      } catch (e) {
        console.error('courier note failed:', (e as Error).message);
      }
    }
    return ok();
  }
  const cb = update.callback_query;
  if (!cb) return ok();

  const answer = (text: string) => tg('answerCallbackQuery', { callback_query_id: cb.id, text });

  // Кнопки ЗП курьера (p:ok:<id>, p:yes:<id>:<сумма>, p:no:<id>) — только админы из ADMIN_TG_IDS, у остальных «Нет прав» и ничего не меняется.
  const pm = /^p:(ok|yes|no):(\d+)(?::(\d+))?$/.exec(cb.data ?? '');
  if (pm) {
    if (!ADMINS.has(String(cb.from?.id))) {
      await answer('Нет прав');
      return ok();
    }
    return handlePayroll(cb, pm[1] as 'ok' | 'yes' | 'no', Number(pm[2]), pm[3] ? Number(pm[3]) : null, answer);
  }

  // Кнопки маршрута в группе курьера (d/u — доставлено/отмена, a/s — запасной режим «Заказ прибыл»/«Через сколько буду», n — комментарий): по Telegram id; пишут только отметки курьера, статус заказа не меняют.
  const cm = /^(d|u|a|s|n):(\d+)$/.exec(cb.data ?? '');
  if (cm) {
    const uid = String(cb.from?.id);
    const rowId = Number(cm[2]);
    if (String(cb.message?.chat?.id ?? '') !== (Deno.env.get('COURIER_CHAT_ID') ?? '')) {
      await answer('Некорректная кнопка'); // кнопки маршрута работают только в группе курьера
      return ok();
    }
    const log = (allowed: boolean, result: string) => db.from('courier_button_log').insert({ row_id: rowId, action: cm[1], user_id: cb.from?.id ?? null, username: cb.from?.username ?? null, allowed, result });
    const acc = await courierAccess();
    if (!acc.canButtons(uid)) {
      await log(false, 'Нет прав');
      await answer('Нет прав');
      return ok();
    }
    if (cm[1] === 'n') {
      // «📝 Комментарий»: кнопка видна всем, работает у админов и у id из courier_note_ids; остальным — «Нет прав»
      if (!acc.canNote(uid)) {
        await log(false, 'Нет прав');
        await answer('Нет прав');
        return ok();
      }
      const sn = await startNote(db, rowId, cb.from);
      await log(sn.ok, sn.ok ? 'вопрос отправлен' : (sn.toast ?? 'ошибка'));
      await answer(sn.toast ?? '');
      return ok();
    }
    const by = cb.from?.username ? `@${cb.from.username}` : uid;
    let r = await courierButton(db, cm[1], rowId, by);
    if (!r.ok || !r.edits?.length) {
      await log(r.ok, r.toast || (r.ok ? 'без изменений' : 'ошибка'));
      await answer(r.toast ?? (r.ok ? '' : 'Ошибка'));
      return ok();
    }
    const run = (edits: typeof r.edits) => Promise.all(edits!.map((e) => tg(e.method, { parse_mode: 'HTML', disable_web_page_preview: true, ...e.params })));
    let res = await run(r.edits);
    // Telegram не принял URL-кнопку — перерисовываем в запасном режиме (текст клиенту приходит ответом для копирования)
    if (res.some((x) => !x.ok && /BUTTON_URL_INVALID|URL_INVALID/i.test(x.description ?? ''))) {
      const e = await courierResync(db, rowId, 'copy');
      if (e) res = await run([e]);
    }
    // служебные сообщения (копируемый текст клиенту) запоминаем: у тестовых точек их удаляют при очистке
    const sentIds = res.map((x, i) => (r.edits![i]?.method === 'sendMessage' && x.ok ? Number(x.result?.message_id) : NaN)).filter((x) => Number.isFinite(x));
    if (sentIds.length) await addExtra(db, rowId, sentIds);
    const bad = res.find((x) => !x.ok && !/not modified/i.test(x.description ?? ''));
    if (bad) console.error('courier button edit failed:', bad.description);
    await log(!bad, bad ? `ошибка Telegram: ${bad.description}` : (r.toast || 'ok'));
    await answer(r.toast ?? '');
    return ok();
  }

  if (!ADMINS.has(String(cb.from?.id))) {
    await answer('Нет доступа');
    return ok();
  }

  const msg = cb.message;
  const m = /^([cx]):(NF-\d+)$/.exec(cb.data ?? '');
  if (!m || !msg || String(msg.chat.id) !== Deno.env.get('ORDERS_CHAT_ID')) {
    await answer('Некорректная кнопка');
    return ok();
  }
  const [, action, number] = m;

  const { data: order } = await db.from('orders').select('*').eq('order_number', number).maybeSingle();
  if (!order) {
    await answer('Заказ не найден');
    return ok();
  }

  let next: 'confirmed' | 'cancelled';
  let label: string;
  if (action === 'c') {
    if (order.status !== 'new') {
      await answer(`Уже обработан: ${order.status}`);
      return ok();
    }
    next = 'confirmed';
    label = statusLabel('confirmed', order.lang);
  } else {
    if (order.status === 'delivered') {
      await answer('Заказ уже доставлен');
      return ok();
    }
    if (order.status === 'cancelled') {
      await answer('Уже отклонён');
      return ok();
    }
    next = 'cancelled';
    label = statusLabel(order.status === 'confirmed' ? 'cancelled' : 'rejected', order.lang);
  }

  const by: string = cb.from.username ?? String(cb.from.id);
  const { error } = await db
    .from('orders')
    .update({ status: next, status_changed_at: new Date().toISOString(), status_changed_by: by })
    .eq('id', order.id);
  if (error) {
    console.error(`status update failed for ${number}:`, error.message);
    await answer('Ошибка, попробуйте ещё раз');
    return ok();
  }

  const { data: days } = await db.from('order_days').select('delivery_date').eq('order_id', order.id);
  const text = buildOrderText(order as OrderRow, (days ?? []).map((d) => d.delivery_date), `${label} — @${by}, ${nowDanang()}`, await getDeliveryHours(db));
  const reply_markup = next === 'confirmed' ? keyboardConfirmed(number) : keyboardNone;
  const isPhoto = Array.isArray(msg.photo) && msg.photo.length > 0;
  const r = isPhoto
    ? await tg('editMessageCaption', { chat_id: msg.chat.id, message_id: msg.message_id, caption: text, parse_mode: 'HTML', reply_markup })
    : await tg('editMessageText', { chat_id: msg.chat.id, message_id: msg.message_id, text, parse_mode: 'HTML', reply_markup, disable_web_page_preview: true });
  if (!r.ok) console.error(`edit message failed for ${number}:`, r.description);

  await answer(next === 'confirmed' ? 'Подтверждено' : 'Отклонено');
  return ok();
});

const dm = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;

/** Недельная ЗП курьера: «Одобрить» → подтверждение «Списать Y ₫?» → «Да» → расход в кассе + дни «выплачено». Повтор не создаёт второй расход (блокировка в RPC). */
async function handlePayroll(cb: any, action: 'ok' | 'yes' | 'no', payoutId: number, amount: number | null, answer: (t: string) => Promise<unknown>) {
  const msg = cb.message;
  if (!msg || String(msg.chat.id) !== Deno.env.get('ORDERS_CHAT_ID')) {
    await answer('Некорректная кнопка');
    return ok();
  }
  const by: string = cb.from.username ? `@${cb.from.username}` : String(cb.from.id);
  const { data: po } = await db.from('courier_payouts').select('*').eq('id', payoutId).maybeSingle();
  if (!po) {
    await answer('Отчёт не найден');
    return ok();
  }
  const range = `${dm(po.week_start)}–${dm(po.week_end)}`;
  const edit = (message_id: number, text: string, reply_markup: unknown = { inline_keyboard: [] }) =>
    tg('editMessageText', { chat_id: msg.chat.id, message_id, text, parse_mode: 'HTML', reply_markup, disable_web_page_preview: true });
  const paidLine = (p: { paid_amount: number; paid_by: string; paid_at: string }) => `✅ <b>Выплачено ${fmtRub(p.paid_amount)}</b> · ${p.paid_by} · ${nowDanang(new Date(p.paid_at))}`;

  if (action === 'no') {
    if (po.status !== 'paid') await edit(msg.message_id, `Отменено: списание ЗП курьера за ${range}.`);
    await answer('Отменено');
    return ok();
  }

  if (po.status === 'paid') {
    // повторное нажатие: второй расход не создаётся, сообщение приводим в состояние «выплачено»
    await answer('Уже выплачено');
    if (action === 'yes') await edit(msg.message_id, paidLine(po));
    return ok();
  }

  // Пересчёт по актуальным данным: правки в админке после отправки отчёта учитываются.
  let p;
  try {
    p = await loadPayroll(db, weekDays(po.week_start));
  } catch (e) {
    console.error('payroll recompute failed:', (e as Error).message);
    await answer('Ошибка, попробуйте ещё раз');
    return ok();
  }
  if (!p) {
    await answer('Не задана кухня');
    return ok();
  }
  const { text: reportText, total } = buildPayrollReport(po.week_start, po.week_end, p.days, p.pay);
  if (total <= 0) {
    await answer('Нечего выплачивать');
    return ok();
  }
  const confirmKb = (sum: number) => ({ inline_keyboard: [[{ text: '✅ Да', callback_data: `p:yes:${payoutId}:${sum}` }, { text: 'Отмена', callback_data: `p:no:${payoutId}` }]] });

  if (action === 'ok') {
    const changed = total !== Number(po.amount) ? `\n(в отчёте было ${fmtRub(po.amount)} — после отправки были правки)` : '';
    await tg('sendMessage', {
      chat_id: msg.chat.id,
      text: `Списать <b>${fmtRub(total)}</b> как ЗП курьера за ${range}?${changed}`,
      parse_mode: 'HTML',
      reply_to_message_id: msg.message_id,
      reply_markup: confirmKb(total),
    });
    await answer('Подтвердите списание');
    return ok();
  }

  // action === 'yes'
  if (amount !== total) {
    await edit(msg.message_id, `Сумма изменилась: было ${fmtRub(amount ?? 0)}, стало <b>${fmtRub(total)}</b>. Списать ${fmtRub(total)} как ЗП курьера за ${range}?`, confirmKb(total));
    await answer('Сумма изменилась — проверьте');
    return ok();
  }
  const payDays = p.days.filter((d) => !d.paid).map((d) => ({ date: d.date, courier: d.courier, addresses: d.addresses, km: d.km, amount: d.total }));
  const { data: res, error } = await db.rpc('courier_payout_pay', { p_payout: payoutId, p_amount: total, p_by: by, p_days: payDays });
  if (error || !res || (res.status !== 'paid' && res.status !== 'already')) {
    console.error('courier_payout_pay failed:', error?.message ?? JSON.stringify(res));
    await answer('Ошибка, попробуйте ещё раз');
    return ok();
  }
  const { data: fresh } = await db.from('courier_payouts').select('*').eq('id', payoutId).single();
  const status = paidLine(fresh);
  await edit(msg.message_id, status);
  if (fresh.report_message_id) await edit(fresh.report_message_id, `${reportText}\n\n${status}`);
  await answer(res.status === 'already' ? 'Уже выплачено' : 'Выплачено');
  return ok();
}
