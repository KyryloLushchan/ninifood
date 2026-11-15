-- Одно предупреждение в Orders, когда tg-resend исчерпал 5 попыток (не слать повторно).
alter table public.orders add column if not exists tg_alerted_at timestamptz;
