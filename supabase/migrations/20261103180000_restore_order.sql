-- Восстановление отменённого заказа из админки: статус → «подтверждён», запись в order_edits (kind = restore), только is_admin().
alter table public.order_edits drop constraint if exists order_edits_kind_check;
alter table public.order_edits add constraint order_edits_kind_check check (kind in ('portions', 'address', 'restore'));

create or replace function public.admin_restore_order(p_order uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  v_email text := coalesce(auth.jwt() ->> 'email', '');
  v_by text := coalesce(nullif(split_part(v_email, '@', 1), ''), 'admin');
  o record;
  v_days jsonb;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  select id, order_number, status, total, tg_message_id, lang into o from public.orders where id = p_order for update;
  if not found then raise exception 'not_found'; end if;
  if o.status <> 'cancelled' then raise exception 'not_cancelled'; end if;
  select coalesce(jsonb_agg(delivery_date order by delivery_date), '[]'::jsonb) into v_days
  from public.order_days where order_id = o.id and not delivered and delivery_date >= v_today;
  if jsonb_array_length(v_days) = 0 then raise exception 'no_future_days'; end if;
  update public.orders set status = 'confirmed', status_changed_at = now(), status_changed_by = v_by where id = o.id;
  insert into public.order_edits (order_id, created_by, created_by_email, old_total, new_total, old_portions, new_portions, changes, kind)
  select o.id, auth.uid(), v_email, o.total, o.total, coalesce(s.q, 0), coalesce(s.q, 0),
         jsonb_build_object('status_from', 'cancelled', 'status_to', 'confirmed', 'days', v_days), 'restore'
  from (select sum(qty)::int q from public.order_days where order_id = o.id) s;
  return jsonb_build_object('order_number', o.order_number, 'tg_message_id', o.tg_message_id, 'lang', o.lang, 'by', v_by, 'days', v_days);
end;
$$;
revoke all on function public.admin_restore_order(uuid) from public, anon;
grant execute on function public.admin_restore_order(uuid) to authenticated;
