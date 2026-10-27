-- Seed: настройки. Меню (недельный шаблон) — миграция *_real_menu_data.sql.

insert into public.settings (key, value, is_public) values
  ('price_single',       '170000',                   true),
  ('price_subscription', '750000',                   true),
  ('delivery_single',       '20000',                    true),
  ('telegram_url',       'https://t.me/ninifoodvn', true)
on conflict (key) do nothing;
