-- Приём заказов снова включён (баннер убран) + список «Закрытых дней» доставки (публичная настройка: даты ГГГГ-ММ-ДД через запятую).
insert into settings (key, value, is_public) values
  ('orders_paused', '', true),
  ('closed_days', '2026-11-29,2026-11-30', true)
on conflict (key) do update set value = excluded.value, is_public = excluded.is_public;
