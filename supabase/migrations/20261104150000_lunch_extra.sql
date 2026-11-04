-- Доп. порции для кухни (было константой 2), вычет обеда курьера из ЗП и отключение вычета на конкретный день.
insert into public.settings (key, value, is_public) values
  ('extra_portions', '3', false),
  ('courier_lunch', '50000', false),
  ('courier_lunch_from', '2026-11-05', false)
on conflict (key) do nothing;

-- Админ может убрать вычет обеда на день и курьера (правка до выплаты, с записью в журнал courier_pay_log).
alter table public.courier_pay_days add column lunch_skip boolean not null default false;

create or replace function public.courier_pay_days_log() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_email text := coalesce(auth.jwt() ->> 'email', '');
begin
  if tg_op = 'DELETE' then
    if old.addresses_manual is not null then insert into public.courier_pay_log (date, courier, field, old_value, new_value, by_email) values (old.date, old.courier, 'addresses', old.addresses_manual::text, null, v_email); end if;
    if old.km_manual is not null then insert into public.courier_pay_log (date, courier, field, old_value, new_value, by_email) values (old.date, old.courier, 'km', old.km_manual::text, null, v_email); end if;
    if old.lunch_skip then insert into public.courier_pay_log (date, courier, field, old_value, new_value, by_email) values (old.date, old.courier, 'lunch', 'без вычета', 'вычет', v_email); end if;
    return old;
  end if;
  if new.addresses_manual is distinct from (case when tg_op = 'UPDATE' then old.addresses_manual end) then
    insert into public.courier_pay_log (date, courier, field, old_value, new_value, by_email) values (new.date, new.courier, 'addresses', case when tg_op = 'UPDATE' then old.addresses_manual::text end, new.addresses_manual::text, v_email);
  end if;
  if new.km_manual is distinct from (case when tg_op = 'UPDATE' then old.km_manual end) then
    insert into public.courier_pay_log (date, courier, field, old_value, new_value, by_email) values (new.date, new.courier, 'km', case when tg_op = 'UPDATE' then old.km_manual::text end, new.km_manual::text, v_email);
  end if;
  if new.lunch_skip is distinct from (case when tg_op = 'UPDATE' then old.lunch_skip else false end) then
    insert into public.courier_pay_log (date, courier, field, old_value, new_value, by_email) values (new.date, new.courier, 'lunch', case when (case when tg_op = 'UPDATE' then old.lunch_skip else false end) then 'без вычета' else 'вычет' end, case when new.lunch_skip then 'без вычета' else 'вычет' end, v_email);
  end if;
  new.updated_at := now();
  new.updated_by := nullif(v_email, '');
  return new;
end;
$$;
revoke all on function public.courier_pay_days_log() from public, anon, authenticated;
