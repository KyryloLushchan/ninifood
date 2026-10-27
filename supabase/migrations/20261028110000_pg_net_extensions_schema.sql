-- pg_net не умеет переезжать между схемами — пересоздаём в `extensions` (advisor extension_in_public).
-- Задание cron вызывает net.http_post: схему net создаёт само расширение, вызов не меняется.
drop extension if exists pg_net;
create extension pg_net with schema extensions;
