-- ЗП курьера учитывается с 02.11.2026 (курьер начал работать): дни раньше не входят в расчёт и недельный отчёт.
insert into public.settings (key, value, is_public) values ('courier_pay_from', '2026-11-02', false) on conflict (key) do nothing;
