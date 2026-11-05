-- Группа курьера: доступ по Telegram user id (courier_tg_ids — кнопки маршрута; courier_note_ids — ещё и «📝 Комментарий»), журнал нажатий и тестовые точки (is_test) без влияния на реальные заказы.
insert into public.settings (key, value, is_public) values ('courier_note_ids', '', false) on conflict (key) do nothing;

alter table public.courier_route_msgs add column is_test boolean not null default false, add column extra_msg_ids bigint[] not null default '{}';

-- Журнал нажатий кнопок в группе курьера: кто нажал, что, разрешено ли, результат. Пишет только service role; читают админ и viewer.
create table public.courier_button_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  row_id bigint,
  action text not null,
  user_id bigint,
  username text,
  allowed boolean not null,
  result text
);
create index courier_button_log_row_idx on public.courier_button_log (row_id);
alter table public.courier_button_log enable row level security;
create policy courier_button_log_read on public.courier_button_log for select to authenticated using ((select public.is_admin()) or (select public.is_viewer()));
revoke all on public.courier_button_log from anon, authenticated;
grant select on public.courier_button_log to authenticated;
select cron.schedule('cleanup-courier-log', '40 18 * * *', $$delete from public.courier_button_log where at < now() - interval '60 days'$$);
