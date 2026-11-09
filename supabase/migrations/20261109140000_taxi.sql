-- «Вне маршрута» → «🚕 Такси» (клиентам вдали заказ отправляют такси): переименование колонки, RPC и вида записи журнала. Данные сохраняются.
alter table public.orders rename column off_route to taxi;

drop function if exists public.admin_set_off_route(uuid, boolean);
alter table public.order_edits drop constraint if exists order_edits_kind_check;
update public.order_edits set kind = 'taxi', changes = jsonb_build_object('taxi_from', changes -> 'off_route_from', 'taxi_to', changes -> 'off_route_to') where kind = 'off_route';
alter table public.order_edits add constraint order_edits_kind_check check (kind in ('portions', 'address', 'restore', 'courier_note', 'taxi'));

create or replace function public.admin_set_taxi(p_order uuid, p_value boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := coalesce(auth.jwt() ->> 'email', '');
  o record;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  select id, order_number, taxi, total, status into o from public.orders where id = p_order for update;
  if not found then raise exception 'not_found'; end if;
  if o.status not in ('new', 'confirmed') then raise exception 'order_not_active'; end if;
  if o.taxi = p_value then
    return jsonb_build_object('order_number', o.order_number, 'taxi', p_value, 'changed', false);
  end if;
  update public.orders set taxi = p_value where id = p_order;
  insert into public.order_edits (order_id, created_by, created_by_email, old_total, new_total, old_portions, new_portions, changes, kind)
  select p_order, auth.uid(), v_email, o.total, o.total, coalesce(s.q, 0), coalesce(s.q, 0),
         jsonb_build_object('taxi_from', o.taxi, 'taxi_to', p_value), 'taxi'
  from (select sum(qty)::int q from public.order_days where order_id = p_order) s;
  return jsonb_build_object('order_number', o.order_number, 'taxi', p_value, 'changed', true);
end;
$$;
revoke all on function public.admin_set_taxi(uuid, boolean) from public, anon;
grant execute on function public.admin_set_taxi(uuid, boolean) to authenticated;
