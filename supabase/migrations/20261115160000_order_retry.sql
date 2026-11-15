-- Повтор отправки заказа: ключ запроса (идемпотентность), старт запроса в order_attempts, отчёты клиента о сетевых сбоях.

-- 1) Ключ запроса: один ключ = один заказ (повтор после обрыва возвращает уже созданный заказ, дубля нет).
alter table public.orders add column if not exists request_id uuid;
create unique index if not exists orders_request_id_key on public.orders (request_id) where request_id is not null;

-- 2) order_attempts: ключ запроса + outcome 'received' (запрос дошёл до функции; финальная строка того же ключа — ok/ошибка).
alter table public.order_attempts add column if not exists request_id uuid;
create index if not exists order_attempts_request_idx on public.order_attempts (request_id) where request_id is not null;

-- 3) Отчёты клиента о сетевых ошибках отправки (без телефона/ника/адреса): только INSERT анонимно, читает админ в SQL.
create table if not exists public.order_client_errors (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  request_id uuid,
  attempt smallint check (attempt between 1 and 10),
  kind text not null check (kind in ('network', 'timeout')),
  online boolean,
  elapsed_ms integer check (elapsed_ms between 0 and 3600000),
  origin text check (char_length(origin) <= 100),
  page text check (char_length(page) <= 200),
  ua text check (char_length(ua) <= 300),
  screenshot_bytes integer check (screenshot_bytes >= 0),
  conn text check (char_length(conn) <= 20),
  in_telegram boolean,
  lang text check (char_length(lang) <= 5),
  err text check (char_length(err) <= 120),
  total integer check (total >= 0)
);
create index if not exists order_client_errors_created_idx on public.order_client_errors (created_at desc);
alter table public.order_client_errors enable row level security;
create policy order_client_errors_insert on public.order_client_errors for insert to anon, authenticated with check (true);
revoke all on public.order_client_errors from public, anon, authenticated;
grant insert on public.order_client_errors to anon, authenticated;

-- Защита от спама: ≤ 10 отчётов на один ключ запроса, ≤ 60 в минуту всего; лишнее молча отбрасывается.
create or replace function public.order_client_errors_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.request_id is not null and (select count(*) from public.order_client_errors where request_id = new.request_id) >= 10 then return null; end if;
  if (select count(*) from public.order_client_errors where created_at > now() - interval '1 minute') >= 60 then return null; end if;
  return new;
end;
$$;
revoke all on function public.order_client_errors_guard() from public, anon, authenticated;
create trigger order_client_errors_guard before insert on public.order_client_errors for each row execute function public.order_client_errors_guard();
