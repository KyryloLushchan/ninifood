-- «Последний день доставки»: дни позже нельзя заказать (сайт не показывает, send-order/order-draft отклоняют), Renewals не напоминает,
-- если после сегодняшнего дня до него нет рабочих дней. Пусто — без ограничения. Публичная настройка (сайт читает её анонимно).
insert into public.settings (key, value, is_public) values ('last_delivery_date', '2026-12-30', true)
on conflict (key) do update set value = excluded.value, is_public = true;
