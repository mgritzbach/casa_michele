-- Execute inside BEGIN/ROLLBACK. All events and contacts are synthetic.
do $$
declare
  bar jsonb; guest jsonb; other_bar jsonb; other_guest jsonb; result jsonb;
  snapshot jsonb; change_id uuid := gen_random_uuid(); order_key uuid := gen_random_uuid();
  room text := 'P' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,9));
  payload jsonb := '{"key":"settings:guestOrdering","allowOutOfStockOrders":true}';
begin
  bar := public.casa_begin_bartender_session(room,'shake');
  guest := public.casa_begin_guest_session_v5(room,'Policy Test',null,'policy@example.invalid');
  other_bar := public.casa_begin_bartender_session(room||'B','shake');
  other_guest := public.casa_begin_guest_session_v5(room||'B','Other Test',null,'other@example.invalid');
  snapshot := public.casa_event_snapshot_v5(guest->>'token');
  if snapshot->>'allowOutOfStockOrders' is distinct from 'false' then raise exception 'New event policy is not restrictive'; end if;
  perform public.casa_set_availability(bar->>'token','Test Gin',false);
  perform public.casa_set_availability(other_bar->>'token','Test Gin',false);
  result := public.casa_place_order_v5(guest->>'token','test-gin','Test Gin',array['Test Gin'],order_key);
  if result->>'ok' is distinct from 'false' then raise exception 'Unavailable drink accepted by default'; end if;
  result := public.casa_apply_mutation(guest->>'token',change_id,'settings',payload,0);
  if result->>'ok' is distinct from 'false' then raise exception 'Guest changed order policy'; end if;
  result := public.casa_apply_mutation(bar->>'token',gen_random_uuid(),'settings','{"key":"settings:guestOrdering","allowOutOfStockOrders":"yes"}',0);
  if result->>'ok' is distinct from 'false' then raise exception 'Malformed setting accepted'; end if;
  result := public.casa_apply_mutation(bar->>'token',change_id,'settings',payload,0);
  if result->>'ok' is distinct from 'true' or result->>'revision'<>'1' then raise exception 'Setting mutation failed'; end if;
  result := public.casa_apply_mutation(bar->>'token',change_id,'settings',payload,0);
  if result->>'ok' is distinct from 'true' or result->>'revision'<>'1' then raise exception 'Setting retry not idempotent'; end if;
  result := public.casa_apply_mutation(other_bar->>'token',change_id,'settings',payload,0);
  if result->>'ok' is distinct from 'false' then raise exception 'Cross-event mutation token accepted'; end if;
  result := public.casa_apply_mutation(bar->>'token',gen_random_uuid(),'settings',payload,0);
  if result->>'conflict' is distinct from 'true' then raise exception 'Stale setting was accepted'; end if;
  snapshot := public.casa_event_snapshot_v5(guest->>'token');
  if snapshot->>'allowOutOfStockOrders' is distinct from 'true' or snapshot->'revisions'->>'settings:guestOrdering'<>'1' then raise exception 'Guest snapshot lost policy'; end if;
  result := public.casa_place_order_v5(other_guest->>'token','test-gin','Test Gin',array['Test Gin'],gen_random_uuid());
  if result->>'ok' is distinct from 'false' then raise exception 'Policy leaked to another event'; end if;
  result := public.casa_place_order_v5(guest->>'token','test-gin','Test Gin',array['Test Gin'],order_key);
  if result->>'ok' is distinct from 'true' then raise exception 'Override did not allow guest order: %',result; end if;
  result := public.casa_apply_mutation(bar->>'token',gen_random_uuid(),'settings','{"key":"settings:guestOrdering","allowOutOfStockOrders":false}',1);
  if result->>'ok' is distinct from 'true' then raise exception 'Cannot disable override'; end if;
  result := public.casa_place_order_v5(guest->>'token','test-gin','Test Gin',array['Test Gin'],order_key);
  if result->>'ok' is distinct from 'true' or result->>'duplicate' is distinct from 'true' then raise exception 'Accepted order retry changed after disabling override'; end if;
  result := public.casa_place_order_v5(guest->>'token','test-gin','Test Gin',array['Test Gin'],gen_random_uuid());
  if result->>'ok' is distinct from 'false' or result->>'error' not like '%no longer available%' then raise exception 'Disabling override did not block new orders'; end if;
  if (select count(*) from public.orders where idempotency_key=order_key)<>1 then raise exception 'Duplicate order persisted'; end if;
  if has_table_privilege('anon','public.casa_event_rooms','UPDATE') then raise exception 'Anonymous direct policy update permitted'; end if;
end;
$$;
