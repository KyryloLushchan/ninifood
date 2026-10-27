-- Адрес из подсказок Google Places: place_id и координаты (null — адрес введён свободным текстом).
alter table public.orders
  add column place_id text,
  add column lat double precision,
  add column lng double precision;
