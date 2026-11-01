-- Изменение адреса доставки из админки: журнал в order_edits (kind = address) + RPC с проверкой is_admin().
alter table public.order_edits add column kind text not null default 'portions' check (kind in ('portions', 'address'));

-- Адрес хранится на заказе целиком, поэтому меняется у заказа; смена затрагивает только заказы, у которых есть будущие недоставленные дни.
create or replace function public.admin_change_address(
  p_order uuid, p_address text, p_place_id text, p_lat double precision, p_lng double precision, p_comment text, p_also uuid[]
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  v_email text := coalesce(auth.jwt() ->> 'email', '');
  v_addr text := trim(coalesce(p_address, ''));
  v_main record;
  o record;
  v_id uuid;
  v_days jsonb;
  v_res jsonb := '[]'::jsonb;
  v_new_comment text;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if length(v_addr) < 5 or length(v_addr) > 300 then raise exception 'bad_address'; end if;
  if p_comment is not null and length(p_comment) > 500 then raise exception 'bad_comment'; end if;
  if (p_lat is null) <> (p_lng is null) then raise exception 'bad_address'; end if;
  if p_lat is not null and not (p_lat between 15.94 and 16.14 and p_lng between 108.08 and 108.32) then
    p_lat := null; p_lng := null; p_place_id := null;
  end if;
  select id, telegram, customer_id into v_main from public.orders where id = p_order;
  if not found then raise exception 'not_found'; end if;

  for v_id in select distinct x from unnest(array[p_order] || coalesce(p_also, '{}')) x loop
    select id, order_number, telegram, customer_id, status, address, comment, tg_message_id into o from public.orders where id = v_id for update;
    if not found then raise exception 'not_found'; end if;
    if v_id <> p_order and not (lower(trim(o.telegram)) = lower(trim(v_main.telegram)) or (o.customer_id is not null and o.customer_id = v_main.customer_id)) then
      raise exception 'other_client';
    end if;
    if o.status not in ('new', 'confirmed') then
      if v_id = p_order then raise exception 'order_not_active'; end if;
      continue;
    end if;
    select coalesce(jsonb_agg(delivery_date order by delivery_date), '[]'::jsonb) into v_days
    from public.order_days where order_id = v_id and not delivered and delivery_date > v_today;
    if jsonb_array_length(v_days) = 0 then
      if v_id = p_order then raise exception 'no_future_days'; end if;
      continue;
    end if;
    v_new_comment := case when p_comment is null then o.comment else nullif(trim(p_comment), '') end;
    update public.orders set address = v_addr, place_id = p_place_id, lat = p_lat, lng = p_lng, comment = v_new_comment where id = v_id;
    insert into public.order_edits (order_id, created_by, created_by_email, old_total, new_total, old_portions, new_portions, changes, kind)
    select v_id, auth.uid(), v_email, ord.total, ord.total, coalesce(s.q, 0), coalesce(s.q, 0),
           jsonb_build_object('address_from', o.address, 'address_to', v_addr, 'comment_from', o.comment, 'comment_to', v_new_comment, 'days', v_days), 'address'
    from public.orders ord left join lateral (select sum(qty)::int q from public.order_days where order_id = v_id) s on true where ord.id = v_id;
    v_res := v_res || jsonb_build_object('id', v_id, 'order_number', o.order_number, 'tg_message_id', o.tg_message_id, 'old_address', o.address, 'days', v_days);
  end loop;
  return jsonb_build_object('address', v_addr, 'orders', v_res);
end;
$$;
revoke all on function public.admin_change_address(uuid, text, text, double precision, double precision, text, uuid[]) from public, anon;
grant execute on function public.admin_change_address(uuid, text, text, double precision, double precision, text, uuid[]) to authenticated;
