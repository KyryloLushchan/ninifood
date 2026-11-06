-- Renewals: напоминание о продлении теперь в 20:00 по Дананг-времени (13:00 UTC), плюс «первый разовый» — один раз на клиента за всё время.
select cron.schedule(
  'daily-renewal-reminder',
  '0 13 * * *',
  $$select net.http_post(
      url := 'https://jeeaairmlcpueghttnky.supabase.co/functions/v1/renewal-reminder',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
      body := '{}'::jsonb
    )$$
);

-- Кому уже отправлено «первый разовый» (по нику/телефону/аккаунту); только service role.
create table public.renewal_first_notices (
  id bigint generated always as identity primary key,
  nick text,
  phone text,
  customer_id uuid,
  order_number text not null,
  sent_at timestamptz not null default now()
);
create index renewal_first_notices_nick_idx on public.renewal_first_notices (nick);
create index renewal_first_notices_phone_idx on public.renewal_first_notices (phone);
alter table public.renewal_first_notices enable row level security; -- политик нет: ролям API не виден
revoke all on public.renewal_first_notices from anon, authenticated;
