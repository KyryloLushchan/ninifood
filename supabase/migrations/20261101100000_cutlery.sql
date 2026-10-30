-- Одноразовые приборы (бесплатно): флаг в заказе и последнее значение клиента (подставляется в следующий заказ).
alter table public.orders add column cutlery boolean not null default false;
alter table public.customers add column cutlery boolean not null default false;
