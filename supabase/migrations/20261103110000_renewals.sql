-- Напоминание о продлении подписки: одноразовые ссылки (код вместо данных клиента) и ежедневный список в группу «NiniFood Renewals».

-- Код продления: 22 символа base62, 7 дней, одноразовый. Данные клиента в ссылку не кладём — их по коду отдаёт сервер (order-draft, action renewal_get).
create table public.renewal_links (
  code text primary key check (code ~ '^[0-9A-Za-z]{22}$'),
  order_id uuid not null references public.orders(id) on delete cascade,
  portions smallint not null check (portions between 1 and 99),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  used_at timestamptz,
  used_order_id uuid
);
create index renewal_links_order_idx on public.renewal_links (order_id);
create index renewal_links_expires_idx on public.renewal_links (expires_at);

-- Неудачные запросы кода (защита от перебора): ограничение по IP.
create table public.renewal_attempts (
  id bigint generated always as identity primary key,
  ip_hash text not null,
  created_at timestamptz not null default now()
);
create index renewal_attempts_ip_created_idx on public.renewal_attempts (ip_hash, created_at);

alter table public.renewal_links enable row level security; -- политик нет: ролям API не видны (только service role)
alter table public.renewal_attempts enable row level security;
revoke all on public.renewal_links, public.renewal_attempts from anon, authenticated;

select cron.schedule('cleanup-renewals', '30 18 * * *', $$delete from public.renewal_links where expires_at < now() - interval '30 days'; delete from public.renewal_attempts where created_at < now() - interval '3 days'$$);

-- Список заканчивающихся подписок: каждый день в 18:00 по Дананг-времени = 11:00 UTC (если никого нет — функция ничего не отправляет).
select cron.schedule(
  'daily-renewal-reminder',
  '0 11 * * *',
  $$select net.http_post(
      url := 'https://jeeaairmlcpueghttnky.supabase.co/functions/v1/renewal-reminder',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
      body := '{}'::jsonb
    )$$
);

-- Служебная таблица обнаружения групп больше не нужна.
drop table if exists public.tg_chats;
