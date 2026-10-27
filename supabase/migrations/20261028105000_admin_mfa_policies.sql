-- Безопасность, часть 2: MFA (aal2) для админа, политики без дублей, индексы. Применять ПОСЛЕ выката экрана MFA в админке.

-- ───────── Админ только при MFA (aal2) ─────────
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
     and exists (select 1 from public.admins where user_id = auth.uid());
$$;
-- anon политик с is_admin() не касается; роль authenticated функция нужна для RLS.
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated, service_role;

-- ───────── Политики без дублей SELECT (advisor multiple_permissive_policies) ─────────
drop policy menu_admin_write on public.menu_dishes;
create policy menu_admin_insert on public.menu_dishes for insert to authenticated with check (public.is_admin());
create policy menu_admin_update on public.menu_dishes for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy menu_admin_delete on public.menu_dishes for delete to authenticated using (public.is_admin());

drop policy settings_public_read on public.settings;
drop policy settings_admin_all on public.settings;
create policy settings_anon_read on public.settings for select to anon using (is_public);
create policy settings_auth_read on public.settings for select to authenticated using (is_public or public.is_admin());
create policy settings_admin_insert on public.settings for insert to authenticated with check (public.is_admin());
create policy settings_admin_update on public.settings for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy settings_admin_delete on public.settings for delete to authenticated using (public.is_admin());

-- ───────── Индексы на внешние ключи кассы ─────────
create index cash_movements_category_idx   on public.cash_movements (category_id, type);
create index cash_movements_created_by_idx on public.cash_movements (created_by);
