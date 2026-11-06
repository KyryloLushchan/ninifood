-- Время доставки (для сообщения о заказе в Orders: «📅 Дни: … — доставка 13:00–16:00»).
insert into public.settings (key, value, is_public) values
  ('delivery_from', '13:00', true),
  ('delivery_to', '16:00', true)
on conflict (key) do nothing;
