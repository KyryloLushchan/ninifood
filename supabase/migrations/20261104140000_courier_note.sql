-- Комментарий админа к точке маршрута (отдельно от комментария клиента): виден курьеру в группе и в админке → «Курьер»; запись в order_edits (kind = courier_note).
alter table public.order_days add column courier_note text;
alter table public.courier_route_msgs add column note text, add column note_prompt_id bigint, add column note_prompt_by bigint;
create index courier_route_msgs_prompt_idx on public.courier_route_msgs (note_prompt_id) where note_prompt_id is not null;
alter table public.order_edits drop constraint if exists order_edits_kind_check;
alter table public.order_edits add constraint order_edits_kind_check check (kind in ('portions', 'address', 'restore', 'courier_note'));
