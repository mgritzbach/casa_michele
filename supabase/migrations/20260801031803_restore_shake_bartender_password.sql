-- Restore the original shared Casa Michele bartender password.
-- Existing rooms are reset so `shake` works consistently everywhere.

update public.casa_event_rooms
set pin_hash = extensions.crypt('shake', extensions.gen_salt('bf', 10)),
    failed_attempts = 0,
    locked_until = null;

create or replace function public.casa_begin_bartender_session(p_event_code text, p_pin text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text := upper(trim(coalesce(p_event_code, '')));
  v_pin text := coalesce(p_pin, '');
  v_shared_pin constant text := 'shake';
  v_room public.casa_event_rooms%rowtype;
  v_token text;
  v_inserted integer := 0;
  v_attempts integer;
  v_expires_at timestamptz := now() + interval '12 hours';
begin
  if v_code !~ '^[A-Z0-9]{4,12}$' then
    return jsonb_build_object('ok', false, 'error', 'Use a 4-12 character event code.');
  end if;
  if length(v_pin) > 64 then
    return jsonb_build_object('ok', false, 'error', 'The bartender password is too long.');
  end if;

  delete from public.casa_sessions where expires_at <= now();
  insert into public.casa_event_rooms(event_code, pin_hash)
  values (v_code, extensions.crypt(v_shared_pin, extensions.gen_salt('bf', 10)))
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
    return jsonb_build_object('ok', false, 'error', 'Incorrect bartender password.');
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

revoke all on function public.casa_begin_bartender_session(text, text) from public;
grant execute on function public.casa_begin_bartender_session(text, text) to anon, authenticated;
