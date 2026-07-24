-- Casa Michele secure event access layer.
-- Scoped to Casa Michele objects because this Supabase project is shared.

create table if not exists public.casa_event_rooms (
  event_code text primary key,
  pin_hash text not null,
  failed_attempts integer not null default 0,
  locked_until timestamptz,
  created_at timestamptz not null default now(),
  last_active_at timestamptz not null default now(),
  constraint casa_event_rooms_code_format check (event_code ~ '^[A-Z0-9]{4,12}$'),
  constraint casa_event_rooms_failed_attempts_nonnegative check (failed_attempts >= 0)
);

create table if not exists public.casa_sessions (
  id uuid primary key default gen_random_uuid(),
  event_code text not null references public.casa_event_rooms(event_code) on delete cascade,
  role text not null,
  guest_name text,
  guest_phone text,
  token_hash bytea not null unique,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null,
  constraint casa_sessions_role_check check (role in ('guest', 'bartender')),
  constraint casa_sessions_guest_shape check (
    (role = 'guest' and guest_name is not null)
    or (role = 'bartender' and guest_name is null and guest_phone is null)
  )
);

alter table public.orders
  add column if not exists casa_session_id uuid references public.casa_sessions(id) on delete set null,
  add column if not exists idempotency_key uuid;

create unique index if not exists orders_idempotency_key_unique
  on public.orders(idempotency_key) where idempotency_key is not null;
create index if not exists orders_event_created_idx on public.orders(event_code, created_at desc);
create index if not exists casa_sessions_event_expiry_idx on public.casa_sessions(event_code, expires_at);
create index if not exists availability_event_idx on public.availability(event_code);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.orders'::regclass and conname = 'orders_status_check'
  ) then
    alter table public.orders add constraint orders_status_check
      check (status in ('pending', 'completed', 'deleted')) not valid;
    alter table public.orders validate constraint orders_status_check;
  end if;
end
$$;

alter table public.casa_event_rooms enable row level security;
alter table public.casa_sessions enable row level security;
alter table public.orders enable row level security;
alter table public.availability enable row level security;

drop policy if exists "Public Access Orders" on public.orders;
drop policy if exists "Public Access Availability" on public.availability;

revoke all on table public.casa_event_rooms from public, anon, authenticated;
revoke all on table public.casa_sessions from public, anon, authenticated;
revoke all on table public.orders from public, anon, authenticated;
revoke all on table public.availability from public, anon, authenticated;

create or replace function public.casa_begin_bartender_session(p_event_code text, p_pin text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text := upper(trim(coalesce(p_event_code, '')));
  v_pin text := coalesce(p_pin, '');
  v_room public.casa_event_rooms%rowtype;
  v_token text;
  v_inserted integer := 0;
  v_attempts integer;
  v_expires_at timestamptz := now() + interval '12 hours';
begin
  if v_code !~ '^[A-Z0-9]{4,12}$' then
    return jsonb_build_object('ok', false, 'error', 'Use a 4-12 character event code.');
  end if;
  if length(v_pin) < 6 or length(v_pin) > 64 then
    return jsonb_build_object('ok', false, 'error', 'Use a PIN or passphrase with at least 6 characters.');
  end if;

  delete from public.casa_sessions where expires_at <= now();
  insert into public.casa_event_rooms(event_code, pin_hash)
  values (v_code, extensions.crypt(v_pin, extensions.gen_salt('bf', 10)))
  on conflict (event_code) do nothing;
  get diagnostics v_inserted = row_count;

  select * into v_room from public.casa_event_rooms where event_code = v_code for update;
  if v_room.locked_until is not null and v_room.locked_until > now() then
    return jsonb_build_object('ok', false, 'error', 'Too many incorrect attempts. Try again in a minute.');
  end if;

  if extensions.crypt(v_pin, v_room.pin_hash) <> v_room.pin_hash then
    v_attempts := v_room.failed_attempts + 1;
    update public.casa_event_rooms
    set failed_attempts = v_attempts,
        locked_until = case when v_attempts >= 5 then now() + interval '1 minute' else null end
    where event_code = v_code;
    return jsonb_build_object('ok', false, 'error', 'Incorrect bartender PIN.');
  end if;

  update public.casa_event_rooms
  set failed_attempts = 0, locked_until = null, last_active_at = now()
  where event_code = v_code;

  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into public.casa_sessions(event_code, role, token_hash, expires_at)
  values (v_code, 'bartender', extensions.digest(v_token, 'sha256'), v_expires_at);

  return jsonb_build_object(
    'ok', true, 'token', v_token, 'eventCode', v_code, 'role', 'bartender',
    'expiresAt', v_expires_at, 'created', v_inserted = 1
  );
end
$$;

create or replace function public.casa_begin_guest_session(
  p_event_code text,
  p_guest_name text,
  p_guest_phone text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text := upper(trim(coalesce(p_event_code, '')));
  v_name text := trim(coalesce(p_guest_name, ''));
  v_phone text := nullif(trim(coalesce(p_guest_phone, '')), '');
  v_token text;
  v_expires_at timestamptz := now() + interval '24 hours';
begin
  if v_code !~ '^[A-Z0-9]{4,12}$' then
    return jsonb_build_object('ok', false, 'error', 'Enter a valid event code.');
  end if;
  if length(v_name) < 1 or length(v_name) > 60 then
    return jsonb_build_object('ok', false, 'error', 'Enter your name.');
  end if;
  if v_phone is not null and length(v_phone) > 30 then
    return jsonb_build_object('ok', false, 'error', 'Enter a valid phone number.');
  end if;
  if not exists (select 1 from public.casa_event_rooms where event_code = v_code) then
    return jsonb_build_object('ok', false, 'error', 'Event not found. Ask the bartender to start it first.');
  end if;

  delete from public.casa_sessions where expires_at <= now();
  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into public.casa_sessions(event_code, role, guest_name, guest_phone, token_hash, expires_at)
  values (v_code, 'guest', v_name, v_phone, extensions.digest(v_token, 'sha256'), v_expires_at);
  update public.casa_event_rooms set last_active_at = now() where event_code = v_code;

  return jsonb_build_object(
    'ok', true, 'token', v_token, 'eventCode', v_code, 'role', 'guest',
    'guestName', v_name, 'guestPhone', v_phone, 'expiresAt', v_expires_at
  );
end
$$;

create or replace function public.casa_event_snapshot(p_session_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.casa_sessions%rowtype;
  v_orders jsonb := '[]'::jsonb;
  v_availability jsonb := '{}'::jsonb;
begin
  select * into v_session
  from public.casa_sessions
  where token_hash = extensions.digest(coalesce(p_session_token, ''), 'sha256')
    and expires_at > now();
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Your session expired. Please join again.');
  end if;

  update public.casa_sessions set last_seen_at = now() where id = v_session.id;
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', o.id, 'event_code', o.event_code, 'guest_name', o.guest_name,
      'guest_phone', case when v_session.role = 'bartender' then o.guest_phone else null end,
      'cocktail_id', o.cocktail_id, 'cocktail_name', o.cocktail_name,
      'status', o.status, 'created_at', o.created_at
    ) order by o.created_at desc), '[]'::jsonb)
  into v_orders
  from public.orders o
  where o.event_code = v_session.event_code and o.status <> 'deleted'
    and (v_session.role = 'bartender' or o.casa_session_id = v_session.id);

  select coalesce(jsonb_object_agg(a.ingredient_name, not coalesce(a.is_available, true)), '{}'::jsonb)
  into v_availability
  from public.availability a where a.event_code = v_session.event_code;

  return jsonb_build_object(
    'ok', true, 'role', v_session.role, 'eventCode', v_session.event_code,
    'orders', v_orders, 'availability', v_availability, 'serverTime', now()
  );
end
$$;

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

  select a.ingredient_name into v_unavailable
  from public.availability a
  where a.event_code = v_session.event_code and a.is_available = false
    and a.ingredient_name = any(coalesce(p_ingredients, array[]::text[]))
  limit 1;
  if v_unavailable is not null then
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

create or replace function public.casa_update_order_status(
  p_session_token text,
  p_order_id uuid,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_session public.casa_sessions%rowtype;
begin
  select * into v_session from public.casa_sessions
  where token_hash = extensions.digest(coalesce(p_session_token, ''), 'sha256')
    and expires_at > now();
  if not found or v_session.role <> 'bartender' then
    return jsonb_build_object('ok', false, 'error', 'Bartender access is required.');
  end if;
  if p_status not in ('pending', 'completed', 'deleted') then
    return jsonb_build_object('ok', false, 'error', 'Invalid order status.');
  end if;
  update public.orders set status = p_status
  where id = p_order_id and event_code = v_session.event_code;
  if not found then return jsonb_build_object('ok', false, 'error', 'Order not found.'); end if;
  return jsonb_build_object('ok', true);
end
$$;

create or replace function public.casa_set_availability(
  p_session_token text,
  p_ingredient_name text,
  p_is_available boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.casa_sessions%rowtype;
  v_ingredient text := trim(coalesce(p_ingredient_name, ''));
begin
  select * into v_session from public.casa_sessions
  where token_hash = extensions.digest(coalesce(p_session_token, ''), 'sha256')
    and expires_at > now();
  if not found or v_session.role <> 'bartender' then
    return jsonb_build_object('ok', false, 'error', 'Bartender access is required.');
  end if;
  if length(v_ingredient) < 1 or length(v_ingredient) > 160 then
    return jsonb_build_object('ok', false, 'error', 'Invalid ingredient.');
  end if;
  insert into public.availability(event_code, ingredient_name, is_available)
  values (v_session.event_code, v_ingredient, coalesce(p_is_available, true))
  on conflict (event_code, ingredient_name) do update set is_available = excluded.is_available;
  return jsonb_build_object('ok', true);
end
$$;

revoke all on function public.casa_begin_bartender_session(text, text) from public;
revoke all on function public.casa_begin_guest_session(text, text, text) from public;
revoke all on function public.casa_event_snapshot(text) from public;
revoke all on function public.casa_place_order(text, text, text, text[], uuid) from public;
revoke all on function public.casa_update_order_status(text, uuid, text) from public;
revoke all on function public.casa_set_availability(text, text, boolean) from public;

grant execute on function public.casa_begin_bartender_session(text, text) to anon, authenticated;
grant execute on function public.casa_begin_guest_session(text, text, text) to anon, authenticated;
grant execute on function public.casa_event_snapshot(text) to anon, authenticated;
grant execute on function public.casa_place_order(text, text, text, text[], uuid) to anon, authenticated;
grant execute on function public.casa_update_order_status(text, uuid, text) to anon, authenticated;
grant execute on function public.casa_set_availability(text, text, boolean) to anon, authenticated;
