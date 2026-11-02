-- Рейсы курьера по вместимости: настройки (не публичные) и ручное распределение точек по рейсам на день.
insert into public.settings (key, value, is_public) values
  ('trip_capacity', '9', false),
  ('courier_speed_kmh', '25', false),
  ('stop_minutes', '4', false),
  ('road_factor', '1.3', false),
  ('depart_time', '13:00', false),
  ('deadline_time', '16:00', false),
  ('trip_gap_min', '10', false)
on conflict (key) do nothing;

-- assign: { "<lat,lng точки>": { "c": курьер 1|2, "t": номер рейса } }; couriers — на сколько курьеров сделано распределение.
create table public.route_overrides (
  date date primary key,
  couriers smallint not null check (couriers in (1, 2)),
  assign jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by text
);
alter table public.route_overrides enable row level security;
create policy route_overrides_admin_all on public.route_overrides for all to authenticated using (public.is_admin()) with check (public.is_admin());
revoke all on public.route_overrides from anon, authenticated;
grant select, insert, update, delete on public.route_overrides to authenticated;
