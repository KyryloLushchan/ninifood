-- Безопасность, часть 1: журнал попыток send-order (rate limit, мониторинг) и антиспам-таблицы.

-- ───────── Журнал попыток send-order (rate limit, мониторинг, страна — только лог) ─────────
create table public.order_attempts (
  id           bigint generated always as identity primary key,
  created_at   timestamptz not null default now(),
  ip_hash      text,            -- sha256(ip + соль); сам IP не храним
  phone        text,            -- +84XXXXXXXXX (нормализованный)
  telegram     text,            -- в нижнем регистре, без @
  country      text,            -- cf-ipcountry, только для лога
  outcome      text not null,   -- 'ok' или код ошибки
  order_number text
);
create index order_attempts_created_idx  on public.order_attempts (created_at);
create index order_attempts_ip_idx       on public.order_attempts (ip_hash, created_at) where outcome = 'ok';
create index order_attempts_phone_idx    on public.order_attempts (phone, created_at) where outcome = 'ok';
create index order_attempts_telegram_idx on public.order_attempts (telegram, created_at) where outcome = 'ok';

-- Когда последний раз слали «⚠️ подозрительная активность» (не чаще раза в час на вид).
create table public.security_alerts (
  kind         text primary key,
  last_sent_at timestamptz not null default 'epoch'
);
insert into public.security_alerts (kind) values ('orders_spike'), ('errors_spike');

-- RLS включён, политик нет: доступ только у service role (edge-функции).
alter table public.order_attempts  enable row level security;
alter table public.security_alerts enable row level security;
revoke all on public.order_attempts, public.security_alerts from anon, authenticated;

-- Старые записи чистим раз в сутки (для лимитов нужны сутки, для мониторинга — час).
select cron.schedule('cleanup-order-attempts', '30 18 * * *', $$delete from public.order_attempts where created_at < now() - interval '3 days'$$);
