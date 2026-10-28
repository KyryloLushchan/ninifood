-- Вход по email + паролю вместо Telegram и MFA: customers по email, VIP по email, журнал попыток входа, админ без aal2.

-- ───────── Админ: только запись в admins (без MFA) ─────────
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated, service_role;
delete from auth.mfa_factors where user_id in (select user_id from public.admins);

-- ───────── Telegram-пользователи (если есть) удаляются; customers/orders каскадом/set null ─────────
delete from auth.users where email like '%@telegram.ninifood.invalid';

-- ───────── customers: email, Telegram — вручную ─────────
alter table public.customers
  alter column telegram_id drop not null,
  add column email text;
alter table public.customers rename column telegram_username to telegram;
alter table public.customers add constraint customers_telegram_len check (telegram is null or char_length(telegram) <= 64);
update public.customers c set email = lower(u.email) from auth.users u where u.id = c.user_id;
alter table public.customers drop column telegram_id;

-- Клиент может менять контакты и свой Telegram.
revoke update on public.customers from authenticated;
grant update (telegram, phone, address, place_id, lat, lng) on public.customers to authenticated;

-- Строка профиля создаётся вместе с пользователем (и для уже существующих — сейчас).
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.customers (user_id, email) values (new.id, lower(new.email)) on conflict (user_id) do nothing;
  return new;
end;
$$;
revoke all on function public.handle_new_user() from public, anon, authenticated;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
insert into public.customers (user_id, email) select id, lower(email) from auth.users on conflict (user_id) do nothing;

-- ───────── VIP по email ─────────
delete from public.vip_customers;
alter table public.vip_customers drop column telegram_username, drop column telegram_id;
alter table public.vip_customers add column email text not null;
alter table public.vip_customers add constraint vip_email_lower check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(email) <= 254);
alter table public.vip_customers add constraint vip_email_unique unique (email);
insert into public.vip_customers (email, note) values ('lushankirill@gmail.com', 'владелец');

-- Только для показа в интерфейсе (дни «сегодня» в календаре); настоящую проверку делает send-order по email из JWT.
create or replace function public.my_is_vip() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.vip_customers v where v.email = lower(coalesce(auth.jwt() ->> 'email', '')));
$$;
revoke all on function public.my_is_vip() from public, anon;
grant execute on function public.my_is_vip() to authenticated;

-- ───────── Журнал попыток входа/регистрации/сброса (auth-gate): лимиты и паузы ─────────
create table public.auth_attempts (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  kind       text not null,      -- signin | signup | reset | reset_confirm
  ok         boolean not null,
  ip_hash    text,               -- sha256(ip + соль)
  email_hash text,               -- sha256(email + соль)
  country    text
);
create index auth_attempts_ip_idx    on public.auth_attempts (ip_hash, created_at);
create index auth_attempts_email_idx on public.auth_attempts (email_hash, created_at);
alter table public.auth_attempts enable row level security;
revoke all on public.auth_attempts from anon, authenticated;
select cron.schedule('cleanup-auth-attempts', '35 18 * * *', $$delete from public.auth_attempts where created_at < now() - interval '2 days'$$);
