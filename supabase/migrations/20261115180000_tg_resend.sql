-- Досылка в Telegram заказов, чьё сообщение в Orders не ушло (tg_message_id is null): cron каждые 5 минут, до 5 попыток, без дублей.
alter table public.orders add column if not exists tg_attempts integer not null default 0;
alter table public.orders add column if not exists tg_last_attempt timestamptz;
-- Скриншот оплаты хранится только в Telegram; чтобы не потерять его при сбое отправки, send-order кладёт копию в закрытый бакет
-- (только service role) и удаляет после успешной отправки. receipt_path — путь объекта, пока сообщение не ушло.
alter table public.orders add column if not exists receipt_path text;
insert into storage.buckets (id, name, public, file_size_limit) values ('pending-receipts', 'pending-receipts', false, 5242880) on conflict (id) do nothing;
create index if not exists orders_tg_pending_idx on public.orders (created_at desc) where tg_message_id is null;

select cron.schedule(
  'tg-resend',
  '*/5 * * * *',
  $$select net.http_post(
      url := 'https://jeeaairmlcpueghttnky.supabase.co/functions/v1/tg-resend',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
      body := '{}'::jsonb,
      timeout_milliseconds := 5000
    )$$
);
