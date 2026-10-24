-- NiniFood: схема БД (шаг 2). Только таблицы, функция is_admin() и RLS.

-- ───────── Настройки ─────────
create table public.settings (
  key       text primary key,
  value     text not null,
  is_public boolean not null default false   -- публичные строки читает anon
);

-- ───────── Меню: по 4 блюда на дату (position 1..4 = суп, салат, горячее, десерт) ─────────
create table public.menu_dishes (
  id        bigint generated always as identity primary key,
  date      date     not null,
  position  smallint not null check (position between 1 and 4),
  name_ua   text not null,
  name_ru   text not null,
  name_en   text not null,
  name_vi   text not null,
  desc_ua   text,
  desc_ru   text,
  desc_en   text,
  desc_vi   text,
  photo_url text,
  unique (date, position)
);
create index menu_dishes_date_idx on public.menu_dishes (date);

-- ───────── Заказы ─────────
-- Номер заказа выдаёт БД (без коллизий); edge-функция берёт его из returning
create sequence public.order_number_seq start 1001;

create table public.orders (
  id              uuid primary key default gen_random_uuid(),
  order_number    text not null unique default ('NF-' || nextval('public.order_number_seq')),
  created_at      timestamptz not null default now(),
  type            text not null check (type in ('single', 'subscription')),
  telegram        text not null,
  address         text not null,
  hotel           text,
  comment         text,
  payment_method  text not null check (payment_method in ('qr', 'cash')),
  qty             integer not null check (qty >= 1),          -- порций в день
  total           bigint  not null check (total >= 0),        -- ₫, считает сервер
  status          text not null default 'new'
                  check (status in ('new', 'confirmed', 'delivered', 'cancelled')),
  lang            text,
  status_changed_at timestamptz,                              -- когда админ нажал ✅/❌
  status_changed_by text,                                     -- telegram username админа
  tg_message_id   bigint,
  receipt_file_id text                                        -- file_id скриншота в Telegram
);
create index orders_created_at_idx on public.orders (created_at desc);
create index orders_status_idx on public.orders (status);

create table public.order_days (
  id            bigint generated always as identity primary key,
  order_id      uuid not null references public.orders (id) on delete cascade,
  delivery_date date not null,
  qty           integer not null check (qty >= 1),
  delivered     boolean not null default false,
  unique (order_id, delivery_date)
);
create index order_days_date_idx on public.order_days (delivery_date);

-- ───────── Админы ─────────
create table public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade
);

-- security definer: читает admins в обход RLS, поэтому политики не зацикливаются
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated, service_role;

-- ───────── RLS ─────────
alter table public.settings    enable row level security;
alter table public.menu_dishes enable row level security;
alter table public.orders      enable row level security;
alter table public.order_days  enable row level security;
alter table public.admins      enable row level security;

-- settings: anon видит только публичные строки; админ — всё
create policy settings_public_read on public.settings
  for select to anon, authenticated using (is_public);
create policy settings_admin_all on public.settings
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- menu_dishes: читают все; пишет админ
create policy menu_public_read on public.menu_dishes
  for select to anon, authenticated using (true);
create policy menu_admin_write on public.menu_dishes
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- orders / order_days: только админ (service role обходит RLS — туда пишет edge-функция)
create policy orders_admin_all on public.orders
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy order_days_admin_all on public.order_days
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- admins: только админ
create policy admins_admin_all on public.admins
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Дополнительно к RLS: anon вообще не имеет прав на закрытые таблицы и на запись
revoke all on public.orders, public.order_days, public.admins from anon;
revoke all on sequence public.order_number_seq from anon;
revoke insert, update, delete, truncate on public.settings, public.menu_dishes from anon;
