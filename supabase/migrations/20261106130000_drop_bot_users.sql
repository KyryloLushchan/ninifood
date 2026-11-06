-- Бот в личке не отвечает и ничего не сохраняет: таблица bot_users больше не нужна (записей не было).
drop table if exists public.bot_users;
