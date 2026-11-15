-- Расширенная диагностика сбоев отправки: в err теперь «ошибка | transport=form|json | probe=… | read=…» (до 300 символов).
alter table public.order_client_errors drop constraint if exists order_client_errors_err_check;
alter table public.order_client_errors add constraint order_client_errors_err_check check (char_length(err) <= 300);
