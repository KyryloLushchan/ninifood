-- Персональные скидки по email (только на обеды, доставка без скидки).

create table public.customer_discounts (
  id          bigint generated always as identity primary key,
  email       text not null unique check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(email) <= 254),
  percent     int  not null check (percent between 1 and 100),
  note        text,
  valid_until date,                        -- включительно; null — бессрочно
  created_at  timestamptz not null default now()
);
alter table public.customer_discounts enable row level security;
revoke all on public.customer_discounts from anon, authenticated;
grant select, insert, update, delete on public.customer_discounts to authenticated;
create policy discounts_admin_select on public.customer_discounts for select to authenticated using (public.is_admin());
create policy discounts_admin_insert on public.customer_discounts for insert to authenticated with check (public.is_admin());
create policy discounts_admin_update on public.customer_discounts for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy discounts_admin_delete on public.customer_discounts for delete to authenticated using (public.is_admin());

insert into public.customer_discounts (email, percent, note) values ('lykianovib@gmail.com', 30, 'первая персональная скидка');

alter table public.orders
  add column discount_percent int not null default 0,
  add column discount_amount  bigint not null default 0;

-- Только процент текущего пользователя (для показа в интерфейсе); настоящий расчёт — в send-order.
create or replace function public.my_discount() returns int
language sql stable security definer set search_path = public as $$
  select coalesce((
    select d.percent from public.customer_discounts d
    where d.email = lower(coalesce(auth.jwt() ->> 'email', ''))
      and (d.valid_until is null or d.valid_until >= (now() at time zone 'Asia/Ho_Chi_Minh')::date)
  ), 0);
$$;
revoke all on function public.my_discount() from public, anon;
grant execute on function public.my_discount() to authenticated;
