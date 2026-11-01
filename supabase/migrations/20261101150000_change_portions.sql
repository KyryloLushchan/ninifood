-- Изменение порций в существующем заказе (админка): журнал, доплаты/возвраты, RPC с проверкой is_admin().

create table public.order_edits (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid,
  created_by_email text,
  old_total bigint not null,
  new_total bigint not null,
  old_portions int not null,
  new_portions int not null,
  changes jsonb not null
);
create index order_edits_order_idx on public.order_edits(order_id);

-- Доплата (amount > 0) или возврат (amount < 0). pending — ждёт ручного подтверждения «Оплачено/Возвращено»;
-- cash — наличный заказ, сумма просто входит в «взять наличными» у курьера (отдельного подтверждения нет).
create table public.order_surcharges (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders(id) on delete cascade,
  edit_id bigint references public.order_edits(id) on delete set null,
  amount bigint not null check (amount <> 0),
  status text not null check (status in ('pending', 'paid', 'cash')),
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  paid_by_email text
);
create index order_surcharges_order_idx on public.order_surcharges(order_id);

alter table public.order_edits enable row level security;
alter table public.order_surcharges enable row level security;
create policy order_edits_admin_read on public.order_edits for select to authenticated using (public.is_admin());
create policy order_surcharges_admin_read on public.order_surcharges for select to authenticated using (public.is_admin());
revoke all on public.order_edits, public.order_surcharges from anon, authenticated;
grant select on public.order_edits, public.order_surcharges to authenticated;

-- Касса: пока доплата по наличному заказу не подтверждена, она в приход не входит.
create or replace function public.cash_sync_order(p_order uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  o record;
  v_day date;
  v_done boolean;
  v_cat bigint;
  v_nick text;
  v_pending bigint;
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
  select coalesce(sum(amount), 0) into v_pending from public.order_surcharges where order_id = p_order and status = 'pending';
  select id into v_cat from public.cash_categories where type = 'in' and name = 'Наличные с заказов';
  v_nick := '@' || regexp_replace(regexp_replace(trim(o.telegram), '^(https?://)?(www\.)?t\.me/', '', 'i'), '^@', '');
  if o.total - v_pending <= 0 then
    delete from public.cash_movements where order_id = p_order;
    return;
  end if;
  insert into public.cash_movements (date, type, category_id, amount, comment, order_id, created_by)
  values (v_day, 'in', v_cat, o.total - v_pending, o.order_number || ' ' || v_nick, p_order, null)
  on conflict (order_id) where order_id is not null
  do update set date = excluded.date, amount = excluded.amount, comment = excluded.comment;
end;
$$;

create or replace function public.admin_change_portions(p_order uuid, p_days jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  o record;
  v_today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  v_email text := coalesce(auth.jwt() ->> 'email', '');
  it jsonb;
  d record;
  v_qty int;
  v_old_portions int;
  v_new_portions int := 0;
  v_unit bigint;
  v_old_meals bigint;
  v_new_meals bigint;
  v_new_disc bigint := 0;
  v_new_total bigint;
  v_diff bigint;
  v_changes jsonb := '[]'::jsonb;
  v_edit bigint;
  v_sur bigint;
  v_first date;
  v_first_done boolean;
  v_status text;
  v_max int := 1;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if jsonb_typeof(p_days) <> 'array' then raise exception 'bad_request'; end if;
  select * into o from public.orders where id = p_order for update;
  if not found then raise exception 'not_found'; end if;
  if o.status = 'cancelled' then raise exception 'order_cancelled'; end if;

  select coalesce(sum(qty), 0) into v_old_portions from public.order_days where order_id = p_order;
  if v_old_portions = 0 then raise exception 'bad_request'; end if;

  for d in select id, delivery_date, qty, delivered from public.order_days where order_id = p_order order by delivery_date, id loop
    v_qty := d.qty;
    for it in select * from jsonb_array_elements(p_days) loop
      if (it ->> 'id')::bigint = d.id then
        if jsonb_typeof(it -> 'qty') <> 'number' or (it ->> 'qty')::numeric <> trunc((it ->> 'qty')::numeric) then raise exception 'bad_qty'; end if;
        v_qty := (it ->> 'qty')::int;
      end if;
    end loop;
    if v_qty < 1 or v_qty > 10 then raise exception 'bad_qty'; end if;
    if v_qty <> d.qty then
      if d.delivered or d.delivery_date <= v_today then raise exception 'day_locked'; end if;
      v_changes := v_changes || jsonb_build_object('day_id', d.id, 'date', d.delivery_date, 'old', d.qty, 'new', v_qty);
    end if;
    v_new_portions := v_new_portions + v_qty;
    v_max := greatest(v_max, v_qty);
  end loop;
  -- id, которых нет в заказе
  for it in select * from jsonb_array_elements(p_days) loop
    if not exists (select 1 from public.order_days where order_id = p_order and id = (it ->> 'id')::bigint) then raise exception 'bad_request'; end if;
  end loop;
  if jsonb_array_length(v_changes) = 0 then raise exception 'no_changes'; end if;

  -- Цена обеда: как в заказе (обеды до скидки / число порций); если не делится нацело — по текущим настройкам.
  v_old_meals := o.total - o.delivery_total + o.discount_amount;
  if v_old_meals % v_old_portions = 0 and v_old_meals > 0 then
    v_unit := v_old_meals / v_old_portions;
  elsif o.type = 'subscription' then
    select (value::bigint) / 5 into v_unit from public.settings where key = 'price_subscription';
  else
    select value::bigint into v_unit from public.settings where key = 'price_single';
  end if;
  v_new_meals := v_new_portions * v_unit;
  if o.discount_percent > 0 then
    v_new_disc := least(v_new_meals, ceil(v_new_meals * o.discount_percent / 100.0 / 1000)::bigint * 1000);
  end if;
  v_new_total := v_new_meals - v_new_disc + o.delivery_total;
  v_diff := v_new_total - o.total;

  for it in select * from jsonb_array_elements(v_changes) loop
    update public.order_days set qty = (it ->> 'new')::int where id = (it ->> 'day_id')::bigint;
  end loop;
  update public.orders set qty = v_max, total = v_new_total, discount_amount = v_new_disc where id = p_order;

  insert into public.order_edits (order_id, created_by, created_by_email, old_total, new_total, old_portions, new_portions, changes)
  values (p_order, auth.uid(), v_email, o.total, v_new_total, v_old_portions, v_new_portions, v_changes)
  returning id into v_edit;

  if v_diff <> 0 then
    select delivery_date, delivered into v_first, v_first_done from public.order_days where order_id = p_order order by delivery_date, id limit 1;
    v_status := case when o.payment_method = 'cash' and v_first_done is not true then 'cash' else 'pending' end;
    insert into public.order_surcharges (order_id, edit_id, amount, status) values (p_order, v_edit, v_diff, v_status) returning id into v_sur;
  end if;
  perform public.cash_sync_order(p_order);

  return jsonb_build_object(
    'order_number', o.order_number, 'telegram', o.telegram, 'tg_message_id', o.tg_message_id, 'payment_method', o.payment_method,
    'old_total', o.total, 'new_total', v_new_total, 'diff', v_diff,
    'old_portions', v_old_portions, 'new_portions', v_new_portions, 'surcharge_id', v_sur, 'surcharge_status', v_status
  );
end;
$$;

create or replace function public.admin_settle_surcharge(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare v_order uuid;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  update public.order_surcharges set status = 'paid', paid_at = now(), paid_by_email = coalesce(auth.jwt() ->> 'email', '')
  where id = p_id and status = 'pending' returning order_id into v_order;
  if v_order is null then raise exception 'not_found'; end if;
  perform public.cash_sync_order(v_order);
end;
$$;

revoke all on function public.admin_change_portions(uuid, jsonb), public.admin_settle_surcharge(bigint) from public, anon;
grant execute on function public.admin_change_portions(uuid, jsonb), public.admin_settle_surcharge(bigint) to authenticated;
