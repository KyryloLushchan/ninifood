-- Кухня (старт маршрута курьера) и число курьеров по умолчанию. Не публичные: сайт их не читает.
insert into public.settings (key, value, is_public) values
  ('kitchen_address', '90 Nguyễn Tư Giản, Ngũ Hành Sơn, Đà Nẵng 550000', false),
  ('kitchen_lat', '16.0462726', false),
  ('kitchen_lng', '108.2356202', false),
  ('couriers_count', '1', false)
on conflict (key) do nothing;
