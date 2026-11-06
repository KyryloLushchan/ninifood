-- Кто нажал /start у бота (Mini App NiniFood): чтобы потом писать клиентам напрямую от бота. Пишет только service role (tg-webhook); читает только админ (viewer — нет).
create table public.bot_users (
  user_id bigint primary key,
  username text,
  first_name text,
  last_name text,
  language_code text,
  first_start_at timestamptz not null default now(),
  last_start_at timestamptz not null default now(),
  starts int not null default 1
);
alter table public.bot_users enable row level security;
create policy bot_users_admin_read on public.bot_users for select to authenticated using ((select public.is_admin()));
revoke all on public.bot_users from anon, authenticated;
grant select on public.bot_users to authenticated;
