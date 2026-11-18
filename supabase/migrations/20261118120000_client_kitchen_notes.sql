-- Постоянный комментарий кухне для клиента: действует на все его заказы и дни, пока админ не удалит.
-- Клиент определяется по любому из ключей: ник Telegram, телефон (последние 9 цифр) или аккаунт (customers.user_id).
-- Попадает отдельным блоком «📝 Особые пометки:» в сообщение «Порции на …» (NiniFood Ops). Порции, заказы и деньги не меняет.
create table public.client_kitchen_notes (
  id               bigint generated always as identity primary key,
  note             text not null check (length(btrim(note)) between 1 and 300),
  telegram         text,
  phone            text,
  customer_id      uuid,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  updated_by_email text,
  check (telegram is not null or phone is not null or customer_id is not null)
);
create index client_kitchen_notes_tg_idx on public.client_kitchen_notes (telegram);
create index client_kitchen_notes_phone_idx on public.client_kitchen_notes (phone);
create index client_kitchen_notes_cust_idx on public.client_kitchen_notes (customer_id);
alter table public.client_kitchen_notes enable row level security;
revoke all on public.client_kitchen_notes from anon, authenticated;
-- Прямой доступ к таблице: только чтение (админ и viewer); запись — RPC ниже (только is_admin()).
grant select on public.client_kitchen_notes to authenticated;
create policy ckn_admin_read on public.client_kitchen_notes for select to authenticated using (public.is_admin());
create policy ckn_viewer_read on public.client_kitchen_notes for select to authenticated using ((select public.is_viewer()));

-- Нормализация ключей (одна и та же для записи и поиска).
create or replace function public.ckn_nick(t text) returns text language sql immutable as $$
  select nullif(lower(regexp_replace(regexp_replace(btrim(coalesce(t, '')), '^(https?://)?(www\.)?t\.me/', '', 'i'), '^@', '')), '')
$$;
create or replace function public.ckn_phone(t text) returns text language sql immutable as $$
  select case when length(regexp_replace(coalesce(t, ''), '\D', '', 'g')) >= 8 then right(regexp_replace(t, '\D', '', 'g'), 9) end
$$;

-- Комментарии для набора заказов (отчёт кухне, edge-функции с service_role): по одной строке на заказ (при нескольких совпадениях — самая свежая).
create or replace function public.client_kitchen_notes_for(p_orders uuid[]) returns table (order_id uuid, note_id bigint, note text)
language sql stable security definer set search_path = public as $$
  select distinct on (o.id) o.id, n.id, n.note
  from public.orders o
  join public.client_kitchen_notes n on
       (n.telegram is not null and n.telegram = public.ckn_nick(o.telegram))
    or (n.phone is not null and n.phone = public.ckn_phone(o.phone))
    or (n.customer_id is not null and n.customer_id = o.customer_id)
  where o.id = any (p_orders)
  order by o.id, n.updated_at desc, n.id desc
$$;
revoke all on function public.client_kitchen_notes_for(uuid[]) from public, anon, authenticated;
grant execute on function public.client_kitchen_notes_for(uuid[]) to service_role;

-- Карточка заказа в админке: комментарий клиента этого заказа (админ и viewer) или null.
create or replace function public.get_client_kitchen_note(p_order uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r record;
begin
  if not (public.is_admin() or public.is_viewer()) then raise exception 'forbidden'; end if;
  select f.note_id, f.note into r from public.client_kitchen_notes_for(array[p_order]) f;
  if not found then return null; end if;
  return jsonb_build_object('id', r.note_id, 'note', r.note);
end $$;
revoke all on function public.get_client_kitchen_note(uuid) from public, anon;
grant execute on function public.get_client_kitchen_note(uuid) to authenticated;

-- Создать / изменить / удалить (пустой текст) комментарий клиента заказа. Только админ.
-- Новый ключи берутся из заказа (ник, телефон, аккаунт); при правке недостающие ключи дописываются.
create or replace function public.admin_set_client_kitchen_note(p_order uuid, p_note text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  o record;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_id bigint;
  v_email text := coalesce(auth.jwt() ->> 'email', '');
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if v_note is not null and length(v_note) > 300 then raise exception 'bad_note'; end if;
  select id, telegram, phone, customer_id into o from public.orders where id = p_order;
  if not found then raise exception 'not_found'; end if;
  select f.note_id into v_id from public.client_kitchen_notes_for(array[p_order]) f;
  if v_note is null then
    if v_id is not null then delete from public.client_kitchen_notes where id = v_id; end if;
    return jsonb_build_object('deleted', v_id is not null);
  end if;
  if v_id is null then
    if public.ckn_nick(o.telegram) is null and public.ckn_phone(o.phone) is null and o.customer_id is null then raise exception 'no_client_key'; end if;
    insert into public.client_kitchen_notes (note, telegram, phone, customer_id, updated_by_email)
    values (v_note, public.ckn_nick(o.telegram), public.ckn_phone(o.phone), o.customer_id, v_email) returning id into v_id;
  else
    update public.client_kitchen_notes set note = v_note, updated_at = now(), updated_by_email = v_email,
      telegram = coalesce(telegram, public.ckn_nick(o.telegram)), phone = coalesce(phone, public.ckn_phone(o.phone)), customer_id = coalesce(customer_id, o.customer_id)
    where id = v_id;
  end if;
  return jsonb_build_object('id', v_id, 'note', v_note);
end $$;
revoke all on function public.admin_set_client_kitchen_note(uuid, text) from public, anon;
grant execute on function public.admin_set_client_kitchen_note(uuid, text) to authenticated;

-- @kuchma_psy — «Соус отдельно» (телефон — из его заказа).
insert into public.client_kitchen_notes (note, telegram, phone, updated_by_email)
select 'Соус отдельно', 'kuchma_psy', public.ckn_phone(o.phone), 'migration'
from (select phone from public.orders where public.ckn_nick(telegram) = 'kuchma_psy' order by created_at desc limit 1) o;
