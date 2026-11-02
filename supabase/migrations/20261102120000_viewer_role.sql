-- Роль «viewer» (партнёр): только просмотр админки. Запрещено по умолчанию: viewer получает SELECT в нужных таблицах,
-- любая запись (INSERT/UPDATE/DELETE, RPC, edge-функции) — только is_admin(). Роль хранится в таблице viewers (не в JWT/metadata).

create table public.viewers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  note text,
  created_at timestamptz not null default now()
);
alter table public.viewers enable row level security;
create policy viewers_admin_all on public.viewers for all to authenticated using (public.is_admin()) with check (public.is_admin());
revoke all on public.viewers from anon, authenticated;

create or replace function public.is_viewer() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.viewers v where v.user_id = auth.uid())
     and not exists (select 1 from public.admins a where a.user_id = auth.uid());
$$;
revoke all on function public.is_viewer() from public, anon;
grant execute on function public.is_viewer() to authenticated, service_role;

-- Роль текущего пользователя для админки: 'admin' | 'viewer' | null.
create or replace function public.my_admin_role() returns text
language sql stable security definer set search_path = public as $$
  select case when public.is_admin() then 'admin' when public.is_viewer() then 'viewer' else null end;
$$;
revoke all on function public.my_admin_role() from public, anon;
grant execute on function public.my_admin_role() to authenticated, service_role;

-- Чтение для viewer: только то, что показывает админка. Записывающих политик для viewer нет (все они — is_admin()).
create policy orders_viewer_read on public.orders for select to authenticated using ((select public.is_viewer()));
create policy order_days_viewer_read on public.order_days for select to authenticated using ((select public.is_viewer()));
create policy order_edits_viewer_read on public.order_edits for select to authenticated using ((select public.is_viewer()));
create policy order_surcharges_viewer_read on public.order_surcharges for select to authenticated using ((select public.is_viewer()));
create policy cash_categories_viewer_read on public.cash_categories for select to authenticated using ((select public.is_viewer()));
create policy cash_movements_viewer_read on public.cash_movements for select to authenticated using ((select public.is_viewer()));
create policy customer_discounts_viewer_read on public.customer_discounts for select to authenticated using ((select public.is_viewer()));
create policy vip_customers_viewer_read on public.vip_customers for select to authenticated using ((select public.is_viewer()));
create policy route_overrides_viewer_read on public.route_overrides for select to authenticated using ((select public.is_viewer()));
create policy settings_viewer_read on public.settings for select to authenticated using ((select public.is_viewer()));

-- Клиентский профиль: viewer свою строку customers не меняет (у остальных клиентов — как было).
drop policy customers_update_own on public.customers;
create policy customers_update_own on public.customers for update to authenticated
  using (user_id = (select auth.uid()) and not (select public.is_viewer()))
  with check (user_id = (select auth.uid()) and not (select public.is_viewer()));

-- Лишние права ролей API: TRUNCATE/REFERENCES/TRIGGER не нужны никому, anon ничего не пишет, служебные таблицы — только service role.
revoke truncate, references, trigger on all tables in schema public from anon, authenticated;
revoke insert, update, delete on all tables in schema public from anon;
revoke insert, update, delete on public.admins from authenticated; -- админы добавляются только вручную (SQL/service role)
revoke all on public.order_drafts from anon, authenticated;

-- Запрещено по умолчанию и для будущих объектов: новые таблицы/функции/последовательности не выдаются anon/authenticated автоматически.
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke execute on functions from public, anon, authenticated;

-- Storage: загрузка/изменение/удаление файлов — только админ (сейчас бакетов нет; у остальных запись и так закрыта RLS без политик).
do $$
begin
  execute 'create policy storage_objects_admin_insert on storage.objects for insert to authenticated with check (public.is_admin())';
  execute 'create policy storage_objects_admin_update on storage.objects for update to authenticated using (public.is_admin()) with check (public.is_admin())';
  execute 'create policy storage_objects_admin_delete on storage.objects for delete to authenticated using (public.is_admin())';
exception when others then
  raise notice 'storage.objects policies not created: %', sqlerrm;
end $$;
