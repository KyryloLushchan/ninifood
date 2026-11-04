-- ETA курьера клиенту («⏱ Через сколько буду»): выбранные минуты и время обещания по точке (видно в админке), состояние выбора в сообщении группы.
alter table public.order_days add column eta_minutes smallint check (eta_minutes between 1 and 60), add column eta_at timestamptz;
alter table public.courier_route_msgs add column lang text, add column nick text, add column eta_minutes smallint, add column eta_at timestamptz, add column eta_draft smallint;
