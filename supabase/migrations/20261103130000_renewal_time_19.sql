-- Напоминание о продлении: 19:00 по Дананг-времени = 12:00 UTC (было 18:00). cron.schedule с тем же именем обновляет задание.
select cron.schedule(
  'daily-renewal-reminder',
  '0 12 * * *',
  $$select net.http_post(
      url := 'https://jeeaairmlcpueghttnky.supabase.co/functions/v1/renewal-reminder',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
      body := '{}'::jsonb
    )$$
);
