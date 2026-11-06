-- Снимок расчёта дня ЗП курьера: после фиксации день не пересчитывается при смене настроек (меняется только ручной правкой «Курьер»).
-- snap_*: адреса и км по плану дня (без ручных правок), ставки на тот день, вычет обеда, сумма. Пишет только service role (функция courier-pay-snapshot / ручная фиксация).
alter table public.courier_pay_days
  add column snap_at timestamptz,
  add column snap_source text check (snap_source in ('cron', 'retro', 'provisional')),
  add column snap_addresses int,
  add column snap_km numeric(7,1),
  add column snap_per_address int,
  add column snap_fuel_l100 numeric(5,2),
  add column snap_fuel_price int,
  add column snap_lunch int,
  add column snap_total bigint;

-- Каждый день (кроме воскресенья) в 23:30 по Дананг-времени (16:30 UTC) — фиксируем расчёт текущего дня.
select cron.schedule(
  'courier-pay-snapshot',
  '30 16 * * *',
  $$select net.http_post(
      url := 'https://jeeaairmlcpueghttnky.supabase.co/functions/v1/courier-pay-snapshot',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
      body := '{}'::jsonb
    )$$
);
