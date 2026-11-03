-- Финиш курьера (дом): последний рейс дня заканчивается здесь. Пустые lat/lng = финиша нет (последний рейс открытый, как раньше).
insert into public.settings (key, value, is_public) values
  ('courier_finish_address', 'Hoàng Minh Thắng, Khu đô thị FPT City, Ngũ Hành Sơn, Đà Nẵng 550000', false),
  ('courier_finish_lat', '15.9824019', false),
  ('courier_finish_lng', '108.2603871', false)
on conflict (key) do nothing;
