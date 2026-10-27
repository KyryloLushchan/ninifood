-- Телефон клиента в формате +84XXXXXXXXX (у старых заказов — null).
alter table public.orders add column phone text;
