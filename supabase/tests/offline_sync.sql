-- Run inside a transaction and ROLLBACK. Never sends messages or modifies real events.
do $$
declare
  bar jsonb;
  guest jsonb;
  other_bar jsonb;
  result jsonb;
  snapshot jsonb;
  mutation_id uuid := gen_random_uuid();
  order_id uuid := gen_random_uuid();
  room text := 'T' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,10));
  payload jsonb;
  first_revision bigint;
begin
  bar := public.casa_begin_bartender_session(room,'shake');
  if not (bar->>'ok')::boolean then raise exception 'Test bartender setup failed'; end if;
  guest := public.casa_begin_guest_session_v5(room,'Test Guest',null,'casa-test@example.invalid');
  if not (guest->>'ok')::boolean or guest->>'guestEmail'<>'casa-test@example.invalid' then raise exception 'Email guest failed'; end if;
  result := public.casa_begin_guest_session_v5(room,'Test Guest','+491701234567',null);
  if not (result->>'ok')::boolean then raise exception 'Phone guest failed'; end if;
  result := public.casa_begin_guest_session_v5(room,'Test Guest',null,'broken');
  if (result->>'ok')::boolean then raise exception 'Invalid email accepted'; end if;
  result := public.casa_apply_mutation(bar->>'token',gen_random_uuid(),null,'{}',0);
  if (result->>'ok')::boolean then raise exception 'Null mutation kind accepted'; end if;
  result := public.casa_place_order_v5(guest->>'token','test-espresso','Test Espresso',array['Test Coffee'],mutation_id);
  if not (result->>'ok')::boolean then raise exception 'Guest order failed'; end if;
  select revision into first_revision from public.orders where event_code=room and idempotency_key=mutation_id;
  perform public.casa_place_order_v5(guest->>'token','test-espresso','Test Espresso',array['Test Coffee'],mutation_id);
  if (select count(*) from public.orders where event_code=room and idempotency_key=mutation_id)<>1 then raise exception 'Duplicate guest order'; end if;
  if (select revision from public.orders where event_code=room and idempotency_key=mutation_id)<>first_revision then raise exception 'Retry changed order revision'; end if;
  if (select guest_email from public.orders where event_code=room and idempotency_key=mutation_id)<>'casa-test@example.invalid' then raise exception 'Order lost guest contact'; end if;
  mutation_id := gen_random_uuid();

  payload := jsonb_build_object('ingredient','Test Gin','isAvailable',false);
  result := public.casa_apply_mutation(bar->>'token',mutation_id,'stock',payload,0);
  if not (result->>'ok')::boolean or (result->>'revision')::int<>1 then raise exception 'First stock edit failed'; end if;
  result := public.casa_apply_mutation(bar->>'token',mutation_id,'stock',payload,0);
  if not (result->>'ok')::boolean or (result->>'revision')::int<>1 then raise exception 'Retry was not idempotent'; end if;
  result := public.casa_apply_mutation(bar->>'token',gen_random_uuid(),'stock',payload,0);
  if not (result->>'conflict')::boolean then raise exception 'Stale stock edit was accepted'; end if;
  result := public.casa_apply_mutation(guest->>'token',gen_random_uuid(),'stock',payload,1);
  if (result->>'ok')::boolean then raise exception 'Guest could update stock'; end if;
  perform public.casa_set_availability(bar->>'token','Test Gin',true);
  result := public.casa_apply_mutation(bar->>'token',gen_random_uuid(),'stock',payload,1);
  if not (result->>'conflict')::boolean then raise exception 'Legacy v4 edit did not cause conflict'; end if;

  mutation_id := gen_random_uuid();
  payload := jsonb_build_object('order',jsonb_build_object('id',order_id,'guestName','Walk-in Test','cocktailId','test-cocktail','cocktailName','Test Cocktail','timestamp',extract(epoch from now())*1000));
  result := public.casa_apply_mutation(bar->>'token',mutation_id,'order',payload,0);
  if not (result->>'ok')::boolean then raise exception 'Walk-in order failed'; end if;
  perform public.casa_apply_mutation(bar->>'token',mutation_id,'order',payload,0);
  if (select count(*) from public.orders where id=order_id)<>1 then raise exception 'Duplicate walk-in order'; end if;
  result := public.casa_apply_mutation(bar->>'token',gen_random_uuid(),'status',jsonb_build_object('orderId',order_id,'status','completed'),1);
  if not (result->>'ok')::boolean then raise exception 'Status update failed'; end if;
  snapshot := public.casa_event_snapshot_v5(guest->>'token');
  if jsonb_array_length(snapshot->'orders')<>1 then raise exception 'Guest can see another guest order'; end if;
  if snapshot->'orders'->0->>'guest_email' is not null then raise exception 'Guest snapshot exposes contact details'; end if;

  other_bar:=public.casa_begin_bartender_session(room||'X','shake');
  result:=public.casa_apply_mutation(other_bar->>'token',gen_random_uuid(),'status',jsonb_build_object('orderId',order_id,'status','deleted'),2);
  if (result->>'ok')::boolean then raise exception 'Cross-event mutation allowed'; end if;
  result:=public.casa_event_snapshot_v5('not-a-token');
  if (result->>'ok')::boolean then raise exception 'Invalid session accepted'; end if;
  if has_table_privilege('anon','public.orders','SELECT') or has_table_privilege('anon','public.availability','UPDATE') then raise exception 'Direct anonymous access enabled'; end if;
end;
$$;
