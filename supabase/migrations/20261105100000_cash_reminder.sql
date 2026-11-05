-- 17:00 по Дананг-времени (10:00 UTC): напоминание в Orders о незакрытых сегодня точках с наличными (если таких нет — функция ничего не отправляет).
select cron.schedule(
  'daily-cash-reminder',
  '0 10 * * *',
  $$select net.http_post(
      url := 'https://jeeaairmlcpueghttnky.supabase.co/functions/v1/cash-reminder',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
      body := '{}'::jsonb
    )$$
);
