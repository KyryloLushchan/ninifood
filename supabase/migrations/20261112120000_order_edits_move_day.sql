-- Журнал правок заказа: вид «move_day» (админ перенёс день доставки; changes: day_id, date_from, date_to).
alter table public.order_edits drop constraint if exists order_edits_kind_check;
alter table public.order_edits add constraint order_edits_kind_check
  check (kind = any (array['portions','address','restore','courier_note','taxi','telegram','move_day']));
