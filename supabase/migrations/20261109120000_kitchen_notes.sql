-- Заметки кухне по датам: строка-напоминание в сообщении «Порции на …» (группа NiniFood Ops). Порции и заказы не меняют.
create table public.kitchen_notes (
  id         bigint generated always as identity primary key,
  date       date not null,
  text       text not null check (length(btrim(text)) between 1 and 300),
  created_at timestamptz not null default now()
);
create index kitchen_notes_date_idx on public.kitchen_notes (date);
alter table public.kitchen_notes enable row level security;
revoke all on public.kitchen_notes from anon, authenticated;
grant select, insert, update, delete on public.kitchen_notes to authenticated;
create policy kitchen_notes_admin_select on public.kitchen_notes for select to authenticated using (public.is_admin());
create policy kitchen_notes_admin_insert on public.kitchen_notes for insert to authenticated with check (public.is_admin());
create policy kitchen_notes_admin_update on public.kitchen_notes for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy kitchen_notes_admin_delete on public.kitchen_notes for delete to authenticated using (public.is_admin());
create policy kitchen_notes_viewer_read on public.kitchen_notes for select to authenticated using ((select public.is_viewer()));

insert into public.kitchen_notes (date, text) values
  ('2026-11-10', '2 окрошки без бульона с майонезом'),
  ('2026-11-16', 'Ещё + 2 обеда');
