-- Группа курьера: маршрут дня точками с кнопкой «Доставлено». Курьер пишет только отметку (courier_marked_at), статус заказа/доставки закрывает админ.
alter table public.order_days add column courier_marked_at timestamptz, add column courier_marked_by text;

-- Сообщения маршрута в группе курьера (day — шапка/уведомление, trip — заголовок рейса, stop — точка). Пишет только service role (edge-функции).
create table public.courier_route_msgs (
  id bigint generated always as identity primary key,
  date date not null,
  kind text not null check (kind in ('day', 'trip', 'stop')),
  trip_no int,
  label text,
  sig text,
  text text not null,
  day_ids bigint[] not null default '{}',
  chat_id bigint not null,
  message_id bigint,
  status text not null default 'active' check (status in ('active', 'obsolete')),
  marked_at timestamptz,
  marked_by text,
  created_at timestamptz not null default now()
);
create index courier_route_msgs_date_idx on public.courier_route_msgs (date, status);
alter table public.courier_route_msgs enable row level security;
create policy courier_route_msgs_read on public.courier_route_msgs for select to authenticated using ((select public.is_admin()) or (select public.is_viewer()));
revoke all on public.courier_route_msgs from anon, authenticated;
grant select on public.courier_route_msgs to authenticated;

-- Telegram id курьера и админов, которым разрешена кнопка «Доставлено» (через запятую); правится в Настройки → Курьеры.
insert into public.settings (key, value, is_public) values ('courier_tg_ids', '', false) on conflict (key) do nothing;

-- Сверка опубликованного маршрута с планом: каждые 3 минуты (если маршрут дня не публиковался — функция ничего не делает).
select cron.schedule(
  'courier-route-sync',
  '*/3 * * * *',
  $$select net.http_post(
      url := 'https://jeeaairmlcpueghttnky.supabase.co/functions/v1/courier-route',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
      body := '{"action":"sync"}'::jsonb
    )$$
);
