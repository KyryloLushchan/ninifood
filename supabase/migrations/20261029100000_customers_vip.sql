-- Вход через Telegram: профиль клиента, заказы клиента, VIP-клиенты (заказ на любой день, включая сегодня).

create table public.customers (
  user_id           uuid primary key references auth.users (id) on delete cascade,
  telegram_id       bigint not null unique,
  telegram_username text,
  phone             text check (phone is null or phone ~ '^\+84[0-9]{9}$'),
  address           text check (address is null or char_length(address) <= 300),
  place_id          text check (place_id is null or char_length(place_id) <= 300),
  lat               double precision,
  lng               double precision,
  created_at        timestamptz not null default now()
);
alter table public.customers enable row level security;
-- Клиент видит и меняет только свою строку и только контактные поля; telegram_id/ник пишет tg-auth (service role).
revoke all on public.customers from anon, authenticated;
grant select on public.customers to authenticated;
grant update (phone, address, place_id, lat, lng) on public.customers to authenticated;
create policy customers_select_own on public.customers for select to authenticated using (user_id = auth.uid());
create policy customers_update_own on public.customers for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table public.orders
  add column customer_id uuid references public.customers (user_id) on delete set null,
  add column is_vip boolean not null default false;
create index orders_customer_idx on public.orders (customer_id, created_at desc);

create policy orders_customer_select on public.orders for select to authenticated using (customer_id = auth.uid());
create policy order_days_customer_select on public.order_days for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id and o.customer_id = auth.uid()));

create table public.vip_customers (
  id                bigint generated always as identity primary key,
  telegram_username text not null unique check (telegram_username = lower(telegram_username) and telegram_username ~ '^[a-z0-9_]{4,32}$'),
  telegram_id       bigint unique,
  note              text,
  created_at        timestamptz not null default now()
);
alter table public.vip_customers enable row level security;
revoke all on public.vip_customers from anon, authenticated;
grant select, insert, update, delete on public.vip_customers to authenticated;
create policy vip_admin_select on public.vip_customers for select to authenticated using (public.is_admin());
create policy vip_admin_insert on public.vip_customers for insert to authenticated with check (public.is_admin());
create policy vip_admin_update on public.vip_customers for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy vip_admin_delete on public.vip_customers for delete to authenticated using (public.is_admin());

insert into public.vip_customers (telegram_username, note) values ('kiruxxxa7', 'первый VIP');

-- Только для показа в интерфейсе (дни «сегодня» в календаре); настоящую проверку делает send-order.
create or replace function public.my_is_vip() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.customers c join public.vip_customers v on v.telegram_id = c.telegram_id where c.user_id = auth.uid()
  );
$$;
revoke all on function public.my_is_vip() from public, anon;
grant execute on function public.my_is_vip() to authenticated;
