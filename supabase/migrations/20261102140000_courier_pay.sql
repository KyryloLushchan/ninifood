-- ЗП курьера: настройки, ручные правки по дням и выплаты, недельный отчёт (cron), расход «ЗП курьера» в кассе.

insert into public.settings (key, value, is_public) values
  ('courier_pay_per_address', '20000', false),
  ('courier_fuel_l100', '2.2', false),
  ('courier_fuel_price', '26000', false)
on conflict (key) do nothing;

-- Ручные правки адресов/км по (дата, курьер) до выплаты и фиксация выплаты. Выплаченные поля пишет только RPC (service role).
create table public.courier_pay_days (
  date date not null,
  courier smallint not null check (courier in (1, 2)),
  addresses_manual int check (addresses_manual >= 0),
  km_manual numeric(7,1) check (km_manual >= 0),
  paid_at timestamptz,
  paid_by text,
  paid_addresses int,
  paid_km numeric(7,1),
  paid_amount bigint,
  payout_id bigint,
  updated_at timestamptz not null default now(),
  updated_by text,
  primary key (date, courier)
);

-- Недельные выплаты (по одной записи на неделю Пн–Сб).
create table public.courier_payouts (
  id bigint generated always as identity primary key,
  week_start date not null unique,
  week_end date not null,
  amount bigint not null,
  status text not null default 'pending' check (status in ('pending', 'paid')),
  report_message_id bigint,
  report_text text,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  paid_by text,
  paid_amount bigint
);
alter table public.courier_pay_days add constraint courier_pay_days_payout_fk foreign key (payout_id) references public.courier_payouts(id);

-- Журнал ручных правок.
create table public.courier_pay_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  date date not null,
  courier smallint not null,
  field text not null,
  old_value text,
  new_value text,
  by_email text
);

alter table public.courier_pay_days enable row level security;
alter table public.courier_payouts enable row level security;
alter table public.courier_pay_log enable row level security;

-- Чтение: админ и viewer. Запись: правки по дню — только админ и только пока день не выплачен; выплаты и журнал — только service role (RPC/триггер).
create policy courier_pay_days_read on public.courier_pay_days for select to authenticated using ((select public.is_admin()) or (select public.is_viewer()));
create policy courier_pay_days_admin_insert on public.courier_pay_days for insert to authenticated with check ((select public.is_admin()) and paid_at is null and payout_id is null);
create policy courier_pay_days_admin_update on public.courier_pay_days for update to authenticated using ((select public.is_admin()) and paid_at is null) with check ((select public.is_admin()) and paid_at is null and payout_id is null);
create policy courier_pay_days_admin_delete on public.courier_pay_days for delete to authenticated using ((select public.is_admin()) and paid_at is null);
create policy courier_payouts_read on public.courier_payouts for select to authenticated using ((select public.is_admin()) or (select public.is_viewer()));
create policy courier_pay_log_read on public.courier_pay_log for select to authenticated using ((select public.is_admin()) or (select public.is_viewer()));
revoke all on public.courier_pay_days, public.courier_payouts, public.courier_pay_log from anon, authenticated;
grant select on public.courier_payouts, public.courier_pay_log to authenticated;
grant select, insert, update, delete on public.courier_pay_days to authenticated;

-- Журнал правок: кто, когда, было → стало (ручные адреса и км).
create or replace function public.courier_pay_days_log() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_email text := coalesce(auth.jwt() ->> 'email', '');
begin
  if tg_op = 'DELETE' then
    if old.addresses_manual is not null then insert into public.courier_pay_log (date, courier, field, old_value, new_value, by_email) values (old.date, old.courier, 'addresses', old.addresses_manual::text, null, v_email); end if;
    if old.km_manual is not null then insert into public.courier_pay_log (date, courier, field, old_value, new_value, by_email) values (old.date, old.courier, 'km', old.km_manual::text, null, v_email); end if;
    return old;
  end if;
  if new.addresses_manual is distinct from (case when tg_op = 'UPDATE' then old.addresses_manual end) then
    insert into public.courier_pay_log (date, courier, field, old_value, new_value, by_email) values (new.date, new.courier, 'addresses', case when tg_op = 'UPDATE' then old.addresses_manual::text end, new.addresses_manual::text, v_email);
  end if;
  if new.km_manual is distinct from (case when tg_op = 'UPDATE' then old.km_manual end) then
    insert into public.courier_pay_log (date, courier, field, old_value, new_value, by_email) values (new.date, new.courier, 'km', case when tg_op = 'UPDATE' then old.km_manual::text end, new.km_manual::text, v_email);
  end if;
  new.updated_at := now();
  new.updated_by := nullif(v_email, '');
  return new;
end;
$$;
revoke all on function public.courier_pay_days_log() from public, anon, authenticated;
create trigger courier_pay_days_log_trg before insert or update on public.courier_pay_days for each row execute function public.courier_pay_days_log();
create trigger courier_pay_days_log_del after delete on public.courier_pay_days for each row execute function public.courier_pay_days_log();

-- Касса: расход «ЗП курьера» создаётся только при выплате (ссылка payout_id, не больше одного расхода на выплату); вручную не правится.
insert into public.cash_categories (type, name, sort, is_active)
select 'out', 'ЗП курьера', coalesce((select max(sort) from public.cash_categories), 0) + 1, false
where not exists (select 1 from public.cash_categories where type = 'out' and name = 'ЗП курьера');
alter table public.cash_movements add column payout_id bigint references public.courier_payouts(id);
create unique index cash_movements_payout_uniq on public.cash_movements(payout_id) where payout_id is not null;
drop policy cash_movements_admin_delete on public.cash_movements;
drop policy cash_movements_admin_insert on public.cash_movements;
drop policy cash_movements_admin_update on public.cash_movements;
create policy cash_movements_admin_delete on public.cash_movements for delete to authenticated using ((select public.is_admin()) and order_id is null and payout_id is null);
create policy cash_movements_admin_insert on public.cash_movements for insert to authenticated with check ((select public.is_admin()) and order_id is null and payout_id is null);
create policy cash_movements_admin_update on public.cash_movements for update to authenticated using ((select public.is_admin()) and order_id is null and payout_id is null) with check ((select public.is_admin()) and order_id is null and payout_id is null);

-- Выплата недели: атомарно (блокировка строки выплаты), без повторов. Только service role (вебхук Telegram после «Да» админа).
-- p_days: [{date, courier, addresses, km, amount}] — что именно выплачено; p_amount — их сумма.
create or replace function public.courier_payout_pay(p_payout bigint, p_amount bigint, p_by text, p_days jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  po record;
  v_cat bigint;
  v_mv bigint;
  d jsonb;
  v_sum bigint := 0;
begin
  select * into po from public.courier_payouts where id = p_payout for update;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  if po.status = 'paid' then return jsonb_build_object('status', 'already', 'amount', po.paid_amount, 'by', po.paid_by, 'at', po.paid_at); end if;
  if p_amount <= 0 or jsonb_typeof(p_days) <> 'array' or jsonb_array_length(p_days) = 0 then return jsonb_build_object('status', 'bad_request'); end if;
  for d in select * from jsonb_array_elements(p_days) loop v_sum := v_sum + (d ->> 'amount')::bigint; end loop;
  if v_sum <> p_amount then return jsonb_build_object('status', 'bad_request'); end if;
  select id into v_cat from public.cash_categories where type = 'out' and name = 'ЗП курьера';
  insert into public.cash_movements (date, type, category_id, amount, comment, payout_id, created_by)
  values ((now() at time zone 'Asia/Ho_Chi_Minh')::date, 'out', v_cat, p_amount,
          'ЗП курьера за ' || to_char(po.week_start, 'DD.MM') || '–' || to_char(po.week_end, 'DD.MM') || ' · ' || p_by, p_payout, null)
  returning id into v_mv;
  for d in select * from jsonb_array_elements(p_days) loop
    insert into public.courier_pay_days (date, courier, paid_at, paid_by, paid_addresses, paid_km, paid_amount, payout_id)
    values ((d ->> 'date')::date, (d ->> 'courier')::smallint, now(), p_by, (d ->> 'addresses')::int, (d ->> 'km')::numeric, (d ->> 'amount')::bigint, p_payout)
    on conflict (date, courier) do update set paid_at = now(), paid_by = p_by, paid_addresses = excluded.paid_addresses, paid_km = excluded.paid_km, paid_amount = excluded.paid_amount, payout_id = p_payout;
  end loop;
  update public.courier_payouts set status = 'paid', paid_at = now(), paid_by = p_by, paid_amount = p_amount where id = p_payout;
  return jsonb_build_object('status', 'paid', 'movement_id', v_mv, 'amount', p_amount);
end;
$$;
revoke all on function public.courier_payout_pay(bigint, bigint, text, jsonb) from public, anon, authenticated;
grant execute on function public.courier_payout_pay(bigint, bigint, text, jsonb) to service_role;

-- Недельный отчёт: воскресенье 09:00 по Дананг-времени = 02:00 UTC воскресенья. Секрет — в Vault (cron_secret).
select cron.schedule(
  'weekly-courier-payroll',
  '0 2 * * 0',
  $$select net.http_post(
      url := 'https://jeeaairmlcpueghttnky.supabase.co/functions/v1/courier-payroll',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
      body := '{"action":"weekly"}'::jsonb
    )$$
);
