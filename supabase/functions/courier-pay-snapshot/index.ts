import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsFor } from '../_shared/cors.ts';
import { isSunday, todayISO } from '../_shared/dates.ts';
import { loadPayroll } from '../_shared/payroll.ts';
import { safeEqual } from '../_shared/security.ts';
import { tg } from '../_shared/telegram.ts';

/**
 * Фиксация расчёта дня ЗП курьера (pg_cron каждый день в 23:30 Дананг, воскресенье пропуск): адреса и км по плану дня (без ручных правок), ставки на этот день, вычет обеда и сумма
 * пишутся снимком в courier_pay_days.snap_*. Дальше день не пересчитывается при смене настроек (бензин, ставка, вместимость рейсов…), меняется только ручной правкой во вкладке «Курьер».
 * Уже зафиксированный день (cron/retro) не трогаем; предварительный снимок (provisional) обновляем. Выплаченные дни не трогаем.
 * Доступ: x-cron-secret = CRON_SECRET ИЛИ JWT админа (viewer — forbidden). Тело (необязательно): {date, source: 'cron'|'provisional'}.
 */
Deno.serve(async (req) => {
  const cors = { ...corsFor(req.headers.get('origin')), 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-cron-secret' };
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json({ ok: false, code: 'bad_request' }, 405);

  let allowed = await safeEqual(req.headers.get('x-cron-secret') ?? '', Deno.env.get('CRON_SECRET') ?? '');
  if (!allowed) {
    const anon = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('authorization') ?? '' } }, auth: { persistSession: false } });
    const { data, error } = await anon.rpc('is_admin');
    allowed = !error && data === true;
  }
  if (!allowed) return json({ ok: false, code: 'forbidden' }, 403);

  let date = todayISO();
  let source: 'cron' | 'provisional' = 'cron';
  try {
    const b = await req.json();
    if (typeof b?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.date)) date = b.date;
    if (b?.source === 'provisional') source = 'provisional';
  } catch { /* без тела — сегодня, снимок cron */ }
  if (isSunday(date)) return json({ ok: true, skipped: 'sunday' });

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  try {
    // «с нуля» по текущим настройкам, снимки не учитываем (иначе предварительный снимок не обновить)
    const p = await loadPayroll(db, [date], { fresh: true });
    if (!p) return json({ ok: false, code: 'kitchen_missing' }, 409);
    const { data: existing } = await db.from('courier_pay_days').select('date, courier, snap_at, snap_source, paid_at').eq('date', date);
    let written = 0;
    const kept: number[] = [];
    for (const d of p.days) {
      const ex = (existing ?? []).find((r: any) => r.courier === d.courier);
      if (ex?.paid_at || (ex?.snap_at && ex.snap_source !== 'provisional')) {
        kept.push(d.courier); // уже зафиксирован (cron/retro) или выплачен — не трогаем
        continue;
      }
      const lunch = date >= p.pay.lunchFrom ? p.pay.lunch : 0;
      const { error } = await db.from('courier_pay_days').upsert(
        {
          date,
          courier: d.courier,
          snap_at: new Date().toISOString(),
          snap_source: source,
          snap_addresses: d.autoAddresses,
          snap_km: d.autoKm,
          snap_per_address: p.pay.perAddress,
          snap_fuel_l100: p.pay.fuelPer100,
          snap_fuel_price: p.pay.fuelPrice,
          snap_lunch: lunch,
          snap_total: d.autoAddresses * p.pay.perAddress + d.fuel - lunch,
        },
        { onConflict: 'date,courier' },
      );
      if (error) throw new Error(error.message);
      written++;
    }
    return json({ ok: true, date, written, kept: kept.length });
  } catch (e) {
    console.error('courier-pay-snapshot failed:', (e as Error).message);
    await tg('sendMessage', { chat_id: Deno.env.get('ORDERS_CHAT_ID')!, text: `⚠️ Не удалось зафиксировать расчёт ЗП курьера за ${date}. Повторить: вкладка «Курьер» → день, либо подождать следующего запуска.`, parse_mode: 'HTML' }).catch(() => {});
    return json({ ok: false, code: 'server_error' }, 500);
  }
});
