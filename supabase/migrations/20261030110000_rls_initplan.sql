-- Политики клиента: auth.uid() считаем один раз на запрос (advisor auth_rls_initplan).
drop policy customers_select_own on public.customers;
drop policy customers_update_own on public.customers;
create policy customers_select_own on public.customers for select to authenticated using (user_id = (select auth.uid()));
create policy customers_update_own on public.customers for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy orders_customer_select on public.orders;
create policy orders_customer_select on public.orders for select to authenticated using (customer_id = (select auth.uid()));
drop policy order_days_customer_select on public.order_days;
create policy order_days_customer_select on public.order_days for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id and o.customer_id = (select auth.uid())));
