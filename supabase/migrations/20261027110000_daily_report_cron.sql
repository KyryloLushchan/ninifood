-- Ежедневный отчёт курьеру: 00:00 по Дананг-времени (UTC+7) = 17:00 UTC предыдущего дня.
-- Воскресенье отсекает сама функция daily-report. Секрет — в Vault (имя cron_secret), в файлах его нет.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'daily-courier-report',
  '0 17 * * *',
  $$select net.http_post(
      url := 'https://jeeaairmlcpueghttnky.supabase.co/functions/v1/daily-report',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
      ),
      body := '{}'::jsonb
    )$$
);
