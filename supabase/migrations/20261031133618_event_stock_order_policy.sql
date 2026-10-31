begin;
-- Existing events keep the current restriction until a bartender explicitly opts in.
alter table public.casa_event_rooms
  add column if not exists allow_out_of_stock_orders boolean not null default false,
  add column if not exists settings_revision bigint not null default 0;

create or replace function public.casa_event_snapshot_v5(p_session_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_session public.casa_sessions%rowtype;
  v_orders jsonb;
  v_availability jsonb;
  v_revisions jsonb;
  v_allow boolean;
  v_settings_revision bigint;
begin
  select * into v_session from public.casa_sessions
  where token_hash = extensions.digest(coalesce(p_session_token,''),'sha256') and expires_at > now();
  if not found then return jsonb_build_object('ok',false,'error','Your session expired. Please join again.'); end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',o.id,'event_code',o.event_code,'guest_name',o.guest_name,
    'guest_phone',case when v_session.role='bartender' then o.guest_phone else null end,
    'guest_email',case when v_session.role='bartender' then coalesce(o.guest_email,s.guest_email) else null end,
    'cocktail_id',o.cocktail_id,'cocktail_name',o.cocktail_name,'status',o.status,
    'created_at',o.created_at,'revision',o.revision
  ) order by o.created_at desc),'[]'::jsonb) into v_orders
  from public.orders o left join public.casa_sessions s on s.id=o.casa_session_id
  where o.event_code=v_session.event_code and (v_session.role='bartender' or o.casa_session_id=v_session.id);
  select coalesce(jsonb_object_agg(a.ingredient_name,not a.is_available),'{}'::jsonb)
    into v_availability from public.availability a where a.event_code=v_session.event_code;
  select coalesce(jsonb_object_agg(k,r),'{}'::jsonb) into v_revisions from (
    select 'stock:'||a.ingredient_name k,a.revision r from public.availability a where a.event_code=v_session.event_code
    union all
    select 'order:'||o.id::text k,o.revision r from public.orders o
    where o.event_code=v_session.event_code and (v_session.role='bartender' or o.casa_session_id=v_session.id)
  ) versions;
  select allow_out_of_stock_orders,settings_revision into v_allow,v_settings_revision
    from public.casa_event_rooms where event_code=v_session.event_code;
  v_revisions := v_revisions || jsonb_build_object('settings:guestOrdering',v_settings_revision);
  return jsonb_build_object('ok',true,'orders',v_orders,'availability',v_availability,'revisions',v_revisions,'allowOutOfStockOrders',v_allow);
end;
$$;
revoke all on function public.casa_event_snapshot_v5(text) from public;
grant execute on function public.casa_event_snapshot_v5(text) to anon, authenticated;

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
  if p_kind is null or p_mutation_id is null or p_expected_revision is null or p_expected_revision<0 or p_kind not in ('stock','status','order','settings') then
    return jsonb_build_object('ok',false,'error','Invalid change.');
  end if;
  -- Serialize retries for this event, including simultaneous tabs/devices.
  perform 1 from public.casa_event_rooms where event_code=v_session.event_code for update;
  select * into v_receipt from casa_private.mutation_receipts where id=p_mutation_id;
  if found then
    if v_receipt.event_code<>v_session.event_code then return jsonb_build_object('ok',false,'error','Invalid change token.'); end if;
    return v_receipt.result;
  end if;

  if p_kind='settings' then
    if p_payload->>'key' is distinct from 'settings:guestOrdering'
      or jsonb_typeof(p_payload->'allowOutOfStockOrders') is distinct from 'boolean' then
      return jsonb_build_object('ok',false,'error','Invalid guest ordering setting.');
    end if;
    update public.casa_event_rooms
      set allow_out_of_stock_orders=(p_payload->>'allowOutOfStockOrders')::boolean,
          settings_revision=settings_revision+1
      where event_code=v_session.event_code and settings_revision=p_expected_revision
      returning settings_revision into v_revision;
    get diagnostics v_rows=row_count;
  elsif p_kind='stock' then
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

create or replace function public.casa_place_order(
  p_session_token text,
  p_cocktail_id text,
  p_cocktail_name text,
  p_ingredients text[],
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.casa_sessions%rowtype;
  v_order public.orders%rowtype;
  v_unavailable text;
  v_allow boolean;
begin
  select * into v_session
  from public.casa_sessions
  where token_hash = extensions.digest(coalesce(p_session_token, ''), 'sha256')
    and expires_at > now()
  for update;
  if not found or v_session.role <> 'guest' then
    return jsonb_build_object('ok', false, 'error', 'A valid guest session is required.');
  end if;
  if length(trim(coalesce(p_cocktail_id, ''))) < 1
    or length(trim(coalesce(p_cocktail_name, ''))) < 1
    or length(p_cocktail_name) > 120 or p_idempotency_key is null then
    return jsonb_build_object('ok', false, 'error', 'Invalid cocktail order.');
  end if;

  select * into v_order from public.orders where idempotency_key = p_idempotency_key;
  if found then
    if v_order.casa_session_id <> v_session.id then
      return jsonb_build_object('ok', false, 'error', 'Invalid order token.');
    end if;
    return jsonb_build_object('ok', true, 'orderId', v_order.id, 'duplicate', true);
  end if;

  -- Serialize policy checks with bartender setting and stock changes.
  select allow_out_of_stock_orders into v_allow from public.casa_event_rooms
    where event_code=v_session.event_code for update;
  select a.ingredient_name into v_unavailable
  from public.availability a
  where a.event_code = v_session.event_code and a.is_available = false
    and a.ingredient_name = any(coalesce(p_ingredients, array[]::text[]))
  limit 1;
  if v_unavailable is not null and not coalesce(v_allow,false) then
    return jsonb_build_object('ok', false, 'error', format('%s is no longer available.', v_unavailable));
  end if;
  if exists (
    select 1 from public.orders o
    where o.casa_session_id = v_session.id and o.created_at > now() - interval '5 seconds'
  ) then
    return jsonb_build_object('ok', false, 'error', 'Please wait a moment before ordering again.');
  end if;

  insert into public.orders(
    event_code, guest_name, guest_phone, cocktail_id, cocktail_name,
    status, created_at, casa_session_id, idempotency_key
  ) values (
    v_session.event_code, v_session.guest_name, v_session.guest_phone,
    trim(p_cocktail_id), trim(p_cocktail_name), 'pending', now(), v_session.id, p_idempotency_key
  ) returning * into v_order;
  update public.casa_event_rooms set last_active_at = now() where event_code = v_session.event_code;
  return jsonb_build_object('ok', true, 'orderId', v_order.id, 'duplicate', false);
end
$$;

revoke all on function public.casa_place_order(text,text,text,text[],uuid) from public;
grant execute on function public.casa_place_order(text,text,text,text[],uuid) to anon, authenticated;
commit;
