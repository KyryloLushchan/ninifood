-- Третий способ оплаты «Другой способ» (согласуется в Telegram, скриншот обязателен).
alter table public.orders drop constraint orders_payment_method_check;
alter table public.orders add constraint orders_payment_method_check check (payment_method in ('qr', 'cash', 'other'));
