-- Справочник категорий: новые добавляются строкой, а не правкой кода.
create table public.cash_categories (
  id        bigint generated always as identity primary key,
  type      text not null check (type in ('in', 'out')),
  name      text not null,
  sort      smallint not null default 0,
  is_active boolean not null default true,
  unique (type, name),
  unique (id, type)                              -- для составного FK ниже
);

insert into public.cash_categories (type, name, sort) values
  ('out', 'Продукты',          1),
  ('out', 'Упаковка',          2),
  ('out', 'Доставка/курьер',   3),
  ('out', 'Аренда',            4),
  ('out', 'Реклама',           5),
  ('out', 'Прочее',            6),
  ('in',  'Наличные из кассы', 1),
  ('in',  'Прочее',            2);

-- Ручной приход / расход (только деньги; товары, склад и себестоимость — позже отдельными таблицами)
create table public.cash_movements (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  date        date    not null,                  -- дата операции (Дананг)
  type        text    not null check (type in ('in', 'out')),
  category_id bigint  not null,
  amount      bigint  not null check (amount > 0),   -- ₫, всегда положительная; знак задаёт type
  comment     text,
  created_by  uuid default auth.uid() references auth.users (id) on delete set null,
  foreign key (category_id, type) references public.cash_categories (id, type)  -- тип записи = тип категории
);
create index cash_movements_date_idx on public.cash_movements (date);

alter table public.cash_categories enable row level security;
alter table public.cash_movements  enable row level security;

create policy cash_categories_admin_all on public.cash_categories
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy cash_movements_admin_all on public.cash_movements
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

revoke all on public.cash_categories, public.cash_movements from anon;
