-- Renewals: повторное «весёлое» напоминание через 2 дня после напоминания о продлении / «первого разового», если клиент не заказал.
-- Журнал отправленных напоминаний (по нему идёт повторное; только service role).
create table public.renewal_sent (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('renewal', 'first_single')),
  nick text,
  phone text,
  customer_id uuid,
  order_number text not null,
  sent_at timestamptz not null default now(),
  followup_at timestamptz,
  followup_status text check (followup_status in ('sent', 'skipped'))
);
create index renewal_sent_due_idx on public.renewal_sent (sent_at) where followup_at is null;
alter table public.renewal_sent enable row level security; -- политик нет: ролям API не виден
revoke all on public.renewal_sent from anon, authenticated;

-- 13:00 Дананг = 06:00 UTC
select cron.schedule(
  'daily-renewal-followup',
  '0 6 * * *',
  $$select net.http_post(
      url := 'https://jeeaairmlcpueghttnky.supabase.co/functions/v1/renewal-followup',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
      body := '{}'::jsonb
    )$$
);
