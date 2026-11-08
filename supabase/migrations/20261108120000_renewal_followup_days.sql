-- Повторное напоминание «Голодны?» — через N дней после первого напоминания (раньше было 2). Срок считается на лету от renewal_sent.sent_at, поэтому действует и на уже записанные.
insert into public.settings (key, value, is_public) values ('renewal_followup_days', '7', true) on conflict (key) do nothing;
