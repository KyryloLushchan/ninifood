-- Пауза приёма заказов: settings.orders_paused ('1' — приём выключен), текст объявления на каждом языке. Публичные (сайт читает анонимно).
insert into settings (key, value, is_public) values
  ('orders_paused', '1', true),
  ('pause_text_ru', 'Кухня на техосмотре 🔧 Повар точит ножи, курьер подкачивает шины. Скоро вернёмся с новыми обедами!', true),
  ('pause_text_ua', 'Кухня на техогляді 🔧 Кухар гострить ножі, кур''єр підкачує шини. Скоро повернемося з новими обідами!', true),
  ('pause_text_en', 'Our kitchen is in for a tune-up 🔧 The chef is sharpening knives, the courier is pumping tires. Back soon with new lunches!', true)
on conflict (key) do update set value = excluded.value, is_public = excluded.is_public;
