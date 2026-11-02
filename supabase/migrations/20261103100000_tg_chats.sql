-- Группы, замеченные ботом (добавили бота / написали в группе): нужны, чтобы узнать chat_id при настройке секретов. Только service role.
create table public.tg_chats (
  chat_id bigint primary key,
  title text,
  type text,
  seen_at timestamptz not null default now()
);
alter table public.tg_chats enable row level security; -- политик нет: ролям API не видна
revoke all on public.tg_chats from anon, authenticated;
