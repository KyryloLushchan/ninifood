-- Цены и доставка: обед 165 000, подписка 750 000; доставка 20 000 за день (разовый) / 100 000 за подписку.
update public.settings set value = '165000' where key = 'price_single';
update public.settings set value = '750000' where key = 'price_subscription';
delete from public.settings where key = 'delivery_fee';
insert into public.settings (key, value, is_public) values
  ('delivery_single',       '20000',  true),
  ('delivery_subscription', '100000', true)
on conflict (key) do update set value = excluded.value;

-- total = еда + доставка; delivery_total — доставка отдельно (у старых заказов 0).
alter table public.orders add column delivery_total bigint not null default 0 check (delivery_total >= 0);
