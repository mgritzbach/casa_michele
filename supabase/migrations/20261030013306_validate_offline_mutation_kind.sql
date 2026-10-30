begin;
create or replace function public.casa_apply_mutation(
  p_session_token text,p_mutation_id uuid,p_kind text,p_payload jsonb,p_expected_revision bigint
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_session public.casa_sessions%rowtype;
  v_receipt casa_private.mutation_receipts%rowtype;
  v_result jsonb;
  v_revision bigint;
  v_ingredient text;
  v_status text;
  v_order_id uuid;
  v_order jsonb;
  v_rows integer;
begin
  select * into v_session from public.casa_sessions
  where token_hash=extensions.digest(coalesce(p_session_token,''),'sha256') and expires_at>now();
  if not found or v_session.role<>'bartender' then
    return jsonb_build_object('ok',false,'error','Your bartender session expired. Sign in again to sync.');
  end if;
  if p_kind is null or p_mutation_id is null or p_expected_revision is null or p_expected_revision<0 or p_kind not in ('stock','status','order') then
    return jsonb_build_object('ok',false,'error','Invalid change.');
  end if;
  -- Serialize retries for this event, including simultaneous tabs/devices.
  perform 1 from public.casa_event_rooms where event_code=v_session.event_code for update;
  select * into v_receipt from casa_private.mutation_receipts where id=p_mutation_id;
  if found then
    if v_receipt.event_code<>v_session.event_code then return jsonb_build_object('ok',false,'error','Invalid change token.'); end if;
    return v_receipt.result;
  end if;

  if p_kind='stock' then
    v_ingredient:=trim(p_payload->>'ingredient');
    if v_ingredient is null or length(v_ingredient) not between 1 and 160 or jsonb_typeof(p_payload->'isAvailable') is distinct from 'boolean' then
      return jsonb_build_object('ok',false,'error','Invalid ingredient.');
    end if;
    insert into public.availability(event_code,ingredient_name,is_available,revision)
      values(v_session.event_code,v_ingredient,true,0) on conflict(event_code,ingredient_name) do nothing;
    update public.availability set is_available=(p_payload->>'isAvailable')::boolean
      where event_code=v_session.event_code and ingredient_name=v_ingredient and revision=p_expected_revision
      returning revision into v_revision;
    get diagnostics v_rows=row_count;
  elsif p_kind='status' then
    v_order_id:=(p_payload->>'orderId')::uuid;
    v_status:=p_payload->>'status';
    if v_status is null or v_status not in ('pending','completed','deleted') then
      return jsonb_build_object('ok',false,'error','Invalid order status.');
    end if;
    update public.orders set status=v_status
      where id=v_order_id and event_code=v_session.event_code and revision=p_expected_revision
      returning revision into v_revision;
    get diagnostics v_rows=row_count;
  else
    v_order:=p_payload->'order';
    v_order_id:=(v_order->>'id')::uuid;
    if v_order_id is null or length(trim(coalesce(v_order->>'guestName',''))) not between 1 and 60
      or length(trim(coalesce(v_order->>'cocktailName',''))) not between 1 and 120
      or length(trim(coalesce(v_order->>'cocktailId',''))) not between 1 and 160 then
      return jsonb_build_object('ok',false,'error','Invalid walk-in order.');
    end if;
    insert into public.orders(id,event_code,guest_name,cocktail_id,cocktail_name,status,created_at,revision,idempotency_key)
      values(v_order_id,v_session.event_code,v_order->>'guestName',v_order->>'cocktailId',v_order->>'cocktailName','pending',
        least(now(),greatest(now()-interval '90 days',to_timestamp((v_order->>'timestamp')::double precision/1000))),1,p_mutation_id)
      on conflict(id) do nothing returning revision into v_revision;
    get diagnostics v_rows=row_count;
  end if;
  if v_rows=0 then
    return jsonb_build_object('ok',false,'conflict',true,'error','Choose the server version or keep your saved change.');
  end if;
  v_result:=jsonb_build_object('ok',true,'revision',v_revision);
  insert into casa_private.mutation_receipts(id,event_code,result) values(p_mutation_id,v_session.event_code,v_result);
  return v_result;
exception when invalid_text_representation or numeric_value_out_of_range then
  return jsonb_build_object('ok',false,'error','Invalid change data.');
end;
$$;
revoke all on function public.casa_apply_mutation(text,uuid,text,jsonb,bigint) from public;
grant execute on function public.casa_apply_mutation(text,uuid,text,jsonb,bigint) to anon, authenticated;
commit;
