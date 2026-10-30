-- Наличные заказы попадают в кассу как приход только после доставки первого дня (триггеры в БД, не в коде админки).
insert into public.cash_categories (type, name, sort, is_active) values ('in', 'Наличные с заказов', 0, false) -- is_active = false: в ручной форме не выбирается
on conflict (type, name) do nothing;

alter table public.cash_movements add column order_id uuid references public.orders (id) on delete cascade; -- заказ удалён → запись уходит каскадом
create unique index cash_movements_order_uniq on public.cash_movements (order_id) where order_id is not null; -- не больше одной записи на заказ

-- Идемпотентная сверка: запись есть ⇔ заказ cash, не отменён, и ПЕРВЫЙ день доставки отмечен доставленным.
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
  if not found or o.payment_method <> 'cash' or o.status = 'cancelled' then
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
revoke all on function public.cash_sync_order(uuid) from public, anon, authenticated;

create or replace function public.cash_sync_from_days() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.cash_sync_order(coalesce(new.order_id, old.order_id));
  return null;
end;
$$;
revoke all on function public.cash_sync_from_days() from public, anon, authenticated;
create trigger order_days_cash_sync after update of delivered, delivery_date or delete on public.order_days
for each row execute function public.cash_sync_from_days();

create or replace function public.cash_sync_from_orders() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.cash_sync_order(new.id);
  return null;
end;
$$;
revoke all on function public.cash_sync_from_orders() from public, anon, authenticated;
create trigger orders_cash_sync after update of status, payment_method, total on public.orders
for each row execute function public.cash_sync_from_orders();

-- Автозаписи (order_id не пустой) вручную не создаются, не правятся и не удаляются: только через отметку доставки.
drop policy cash_movements_admin_all on public.cash_movements;
create policy cash_movements_admin_read on public.cash_movements for select to authenticated using ((select public.is_admin()));
create policy cash_movements_admin_insert on public.cash_movements for insert to authenticated with check ((select public.is_admin()) and order_id is null);
create policy cash_movements_admin_update on public.cash_movements for update to authenticated using ((select public.is_admin()) and order_id is null) with check ((select public.is_admin()) and order_id is null);
create policy cash_movements_admin_delete on public.cash_movements for delete to authenticated using ((select public.is_admin()) and order_id is null);

-- Уже доставленные наличные заказы: создаём недостающие записи.
select public.cash_sync_order(id) from public.orders where payment_method = 'cash';
