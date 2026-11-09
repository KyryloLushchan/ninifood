-- Флаг «Вне маршрута» на заказе: заказ не участвует в планировании рейсов, ссылках маршрута и расчёте км/адресов ЗП; курьеру показывается отдельным блоком.
alter table public.orders add column if not exists off_route boolean not null default false;

alter table public.order_edits drop constraint if exists order_edits_kind_check;
alter table public.order_edits add constraint order_edits_kind_check check (kind in ('portions', 'address', 'restore', 'courier_note', 'off_route'));

create or replace function public.admin_set_off_route(p_order uuid, p_value boolean)
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
  select id, order_number, off_route, total, status into o from public.orders where id = p_order for update;
  if not found then raise exception 'not_found'; end if;
  if o.status not in ('new', 'confirmed') then raise exception 'order_not_active'; end if;
  if o.off_route = p_value then
    return jsonb_build_object('order_number', o.order_number, 'off_route', p_value, 'changed', false);
  end if;
  update public.orders set off_route = p_value where id = p_order;
  insert into public.order_edits (order_id, created_by, created_by_email, old_total, new_total, old_portions, new_portions, changes, kind)
  select p_order, auth.uid(), v_email, o.total, o.total, coalesce(s.q, 0), coalesce(s.q, 0),
         jsonb_build_object('off_route_from', o.off_route, 'off_route_to', p_value), 'off_route'
  from (select sum(qty)::int q from public.order_days where order_id = p_order) s;
  return jsonb_build_object('order_number', o.order_number, 'off_route', p_value, 'changed', true);
end;
$$;
revoke all on function public.admin_set_off_route(uuid, boolean) from public, anon;
grant execute on function public.admin_set_off_route(uuid, boolean) to authenticated;
