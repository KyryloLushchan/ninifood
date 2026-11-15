-- Отслеживание рекламных ссылок: визиты по коду источника (ad_visits), источники в заказах (source_first / source_last), статистика для вкладки «Реклама».

-- 1) Заказы: первый и последний источник клиента на момент заказа (код формата ^[a-z0-9-]{1,40}$, иначе null).
alter table public.orders
  add column if not exists source_first text check (source_first ~ '^[a-z0-9-]{1,40}$'),
  add column if not exists source_last text check (source_last ~ '^[a-z0-9-]{1,40}$');

-- 2) Визиты. Пишет анонимный посетитель сайта (только INSERT), читает админ/партнёр через RPC ниже.
create table if not exists public.ad_visits (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  code text not null check (code ~ '^[a-z0-9-]{1,40}$'),
  visitor_id text not null check (visitor_id ~ '^[A-Za-z0-9-]{8,64}$'),
  page text not null default '/' check (char_length(page) <= 200),
  step text not null check (step in ('visit', 'checkout_open', 'order_created')),
  utm_source text check (utm_source ~ '^[a-z0-9._-]{1,60}$'),
  utm_medium text check (utm_medium ~ '^[a-z0-9._-]{1,60}$'),
  utm_campaign text check (utm_campaign ~ '^[a-z0-9._-]{1,60}$'),
  utm_content text check (utm_content ~ '^[a-z0-9._-]{1,60}$')
);
create index if not exists ad_visits_visitor_idx on public.ad_visits (visitor_id, created_at desc);
create index if not exists ad_visits_created_idx on public.ad_visits (created_at desc);
create index if not exists ad_visits_code_idx on public.ad_visits (code, step, created_at desc);

alter table public.ad_visits enable row level security;
-- anon (и вошедший клиент) — только вставка; чтения нет. Политики записи/чтения для админа — ниже; изменять/удалять через API никто не может.
create policy ad_visits_insert on public.ad_visits for insert to anon, authenticated with check (true);
create policy ad_visits_staff_read on public.ad_visits for select to authenticated using ((select public.is_admin()) or (select public.is_viewer()));
revoke all on public.ad_visits from public, anon, authenticated;
grant insert on public.ad_visits to anon, authenticated;
grant select on public.ad_visits to authenticated;

-- 3) Защита от спама: частота записей с одного visitor_id (≤ 10 в минуту, ≤ 100 в сутки), дубль «код+шаг» от того же посетителя не чаще раза в 30 минут,
--    общий потолок 300 записей в минуту. Лишнее молча отбрасывается (клиент получает успех, без ошибок и подсказок). Функция security definer — anon читать таблицу не может.
create or replace function public.ad_visits_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.ad_visits where visitor_id = new.visitor_id and created_at > now() - interval '1 minute') >= 10 then return null; end if;
  if (select count(*) from public.ad_visits where visitor_id = new.visitor_id and created_at > now() - interval '1 day') >= 100 then return null; end if;
  if new.step in ('visit', 'checkout_open') and exists (
    select 1 from public.ad_visits where visitor_id = new.visitor_id and code = new.code and step = new.step and created_at > now() - interval '30 minutes'
  ) then return null; end if;
  if (select count(*) from public.ad_visits where created_at > now() - interval '1 minute') >= 300 then return null; end if;
  return new;
end;
$$;
revoke all on function public.ad_visits_guard() from public, anon, authenticated;
create trigger ad_visits_guard before insert on public.ad_visits for each row execute function public.ad_visits_guard();

-- 4) Воронка по кодам для вкладки «Реклама»: уникальные посетители (visit), открывшие форму (checkout_open). p_since = null — за всё время.
--    Читать могут admin и viewer (проверка внутри; остальным — forbidden).
create or replace function public.ad_visit_stats(p_since timestamptz default null)
returns table (code text, visits integer, opens integer)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.is_admin() or public.is_viewer()) then raise exception 'forbidden'; end if;
  return query
    select v.code,
           count(distinct v.visitor_id) filter (where v.step = 'visit')::integer,
           count(distinct v.visitor_id) filter (where v.step = 'checkout_open')::integer
    from public.ad_visits v
    where p_since is null or v.created_at >= p_since
    group by v.code
    order by v.code;
end;
$$;
revoke all on function public.ad_visit_stats(timestamptz) from public, anon;
grant execute on function public.ad_visit_stats(timestamptz) to authenticated, service_role;
