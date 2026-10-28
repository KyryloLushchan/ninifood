-- Черновики заказа для «Продолжить на телефоне»: пишет и читает только edge-функция order-draft (service role).
create table public.order_drafts (
  id text primary key check (id ~ '^[0-9A-Za-z]{22}$'),
  payload jsonb not null,
  ip_hash text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours'
);
create index order_drafts_ip_created_idx on public.order_drafts (ip_hash, created_at);
create index order_drafts_expires_idx on public.order_drafts (expires_at);
alter table public.order_drafts enable row level security; -- политик нет: anon/authenticated не видят ничего

select cron.schedule('cleanup-order-drafts', '45 18 * * *', $$delete from public.order_drafts where expires_at < now()$$);
