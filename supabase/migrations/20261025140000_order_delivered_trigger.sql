-- Когда доставлены все дни заказа — заказ становится delivered; если отметку сняли — снова confirmed.
create or replace function public.sync_order_delivered()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order uuid := coalesce(new.order_id, old.order_id);
  v_all   boolean;
begin
  select coalesce(bool_and(delivered), false) into v_all from public.order_days where order_id = v_order;
  if v_all then
    update public.orders
       set status = 'delivered',
           status_changed_at = now(),
           status_changed_by = coalesce(auth.jwt() ->> 'email', 'system')
     where id = v_order and status = 'confirmed';
  else
    update public.orders
       set status = 'confirmed',
           status_changed_at = now(),
           status_changed_by = coalesce(auth.jwt() ->> 'email', 'system')
     where id = v_order and status = 'delivered';
  end if;
  return null;
end;
$$;
revoke all on function public.sync_order_delivered() from public, anon, authenticated;

create trigger order_days_sync_delivered
after insert or update of delivered or delete on public.order_days
for each row execute function public.sync_order_delivered();
