-- Приход в кассу — только по подтверждённым/доставленным наличным заказам (новые и отменённые — без записи).
create or replace function public.cash_sync_order(p_order uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  o record;
  v_day date;
  v_done boolean;
  v_cat bigint;
  v_nick text;
begin
  select id, order_number, telegram, payment_method, status, total into o from public.orders where id = p_order;
  if not found or o.payment_method <> 'cash' or o.status not in ('confirmed', 'delivered') then
    delete from public.cash_movements where order_id = p_order;
    return;
  end if;
  select delivery_date, delivered into v_day, v_done from public.order_days where order_id = p_order order by delivery_date, id limit 1;
  if v_day is null or v_done is not true then
    delete from public.cash_movements where order_id = p_order;
    return;
  end if;
  select id into v_cat from public.cash_categories where type = 'in' and name = 'Наличные с заказов';
  v_nick := '@' || regexp_replace(regexp_replace(trim(o.telegram), '^(https?://)?(www\.)?t\.me/', '', 'i'), '^@', '');
  insert into public.cash_movements (date, type, category_id, amount, comment, order_id, created_by)
  values (v_day, 'in', v_cat, o.total, o.order_number || ' ' || v_nick, p_order, null)
  on conflict (order_id) where order_id is not null
  do update set date = excluded.date, amount = excluded.amount, comment = excluded.comment;
end;
$$;
select public.cash_sync_order(id) from public.orders where payment_method = 'cash';
