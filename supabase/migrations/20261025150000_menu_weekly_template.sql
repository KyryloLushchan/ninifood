-- Меню теперь недельный шаблон: одни и те же 4 блюда в каждый Пн, Вт, … Сб.
delete from public.menu_dishes;  -- моковое меню по датам

drop index if exists public.menu_dishes_date_idx;
alter table public.menu_dishes
  drop constraint menu_dishes_date_position_key,
  drop column date,
  add column weekday      smallint not null check (weekday between 1 and 6),  -- 1=Пн … 6=Сб
  add column weight_label text,       -- '450' | '150+' (мясо + гарнир) | '2pc'; единицы подставляет фронт
  add column kcal    integer check (kcal    >= 0),
  add column protein integer check (protein >= 0),
  add column fat     integer check (fat     >= 0),
  add column carbs   integer check (carbs   >= 0),
  add constraint menu_dishes_weekday_position_key unique (weekday, position);
