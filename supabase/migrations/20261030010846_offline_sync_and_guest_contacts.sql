-- Additive v5 API. Existing v4 sessions and RPCs remain compatible.
begin;
create schema if not exists casa_private;
revoke all on schema casa_private from public, anon, authenticated;
alter table public.orders add column if not exists revision bigint not null default 0;
alter table public.orders add column if not exists guest_email text;
alter table public.availability add column if not exists revision bigint not null default 0;
alter table public.casa_sessions add column if not exists guest_email text;

create table if not exists casa_private.mutation_receipts (
  id uuid primary key,
  event_code text not null references public.casa_event_rooms(event_code),
  result jsonb not null,
  created_at timestamptz not null default now()
);
alter table casa_private.mutation_receipts enable row level security;
revoke all on casa_private.mutation_receipts from public, anon, authenticated;
create index if not exists casa_mutation_event_idx on casa_private.mutation_receipts(event_code);

create or replace function casa_private.bump_revision() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  new.revision := old.revision + 1;
  return new;
end;
$$;
drop trigger if exists casa_order_revision on public.orders;
create trigger casa_order_revision before update on public.orders
for each row execute function casa_private.bump_revision();
drop trigger if exists casa_stock_revision on public.availability;
create trigger casa_stock_revision before update on public.availability
for each row execute function casa_private.bump_revision();

create or replace function public.casa_ping() returns boolean
language sql security invoker set search_path = '' as $$ select true $$;
grant execute on function public.casa_ping() to anon, authenticated;

create or replace function public.casa_begin_guest_session_v5(
  p_event_code text, p_guest_name text, p_guest_phone text default null, p_guest_email text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_phone text := nullif(regexp_replace(trim(coalesce(p_guest_phone, '')), '[ ()-]', '', 'g'), '');
  v_email text := nullif(lower(trim(coalesce(p_guest_email, ''))), '');
  v_result jsonb;
begin
  if (v_phone is null) = (v_email is null) then
    return jsonb_build_object('ok', false, 'error', 'Enter either your email or your WhatsApp number.');
  end if;
  if v_phone is not null and v_phone !~ '^\+[1-9][0-9]{6,14}$' then
    return jsonb_build_object('ok', false, 'error', 'Use your WhatsApp number with country code, such as +491701234567.');
  end if;
  if v_email is not null and (length(v_email) > 254 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then
    return jsonb_build_object('ok', false, 'error', 'Enter a valid email address.');
  end if;
  v_result := public.casa_begin_guest_session(p_event_code, p_guest_name, v_phone);
  if coalesce((v_result->>'ok')::boolean, false) then
    update public.casa_sessions set guest_email = v_email
    where token_hash = extensions.digest(v_result->>'token', 'sha256');
    v_result := v_result || jsonb_build_object('guestEmail', v_email);
  end if;
  return v_result;
end;
$$;
revoke all on function public.casa_begin_guest_session_v5(text,text,text,text) from public;
grant execute on function public.casa_begin_guest_session_v5(text,text,text,text) to anon, authenticated;

-- Phone/email are self-reported contact information, not authenticated identity.
create or replace function public.casa_event_snapshot_v5(p_session_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_session public.casa_sessions%rowtype;
  v_orders jsonb;
  v_availability jsonb;
  v_revisions jsonb;
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
  return jsonb_build_object('ok',true,'orders',v_orders,'availability',v_availability,'revisions',v_revisions);
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
  if p_mutation_id is null or p_expected_revision is null or p_expected_revision<0 or p_kind not in ('stock','status','order') then
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
