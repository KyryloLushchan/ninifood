-- Разовая отправка напоминаний о продлении 03.11.2026 в 20:20 по Дананг-времени (13:20 UTC); после запуска задание удаляет само себя.
select cron.schedule(
  'renewal-once-2026-11-03',
  '20 13 3 11 *',
  $$select net.http_post(
      url := 'https://jeeaairmlcpueghttnky.supabase.co/functions/v1/renewal-reminder',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
      body := '{}'::jsonb
    );
    select cron.unschedule('renewal-once-2026-11-03')$$
);
