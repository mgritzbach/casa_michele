begin;
create or replace function public.casa_place_order_v5(
  p_session_token text, p_cocktail_id text, p_cocktail_name text, p_ingredients text[], p_idempotency_key uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_result jsonb;
begin
  v_result := public.casa_place_order(p_session_token,p_cocktail_id,p_cocktail_name,p_ingredients,p_idempotency_key);
  if coalesce((v_result->>'ok')::boolean,false) then
    update public.orders o set guest_email=s.guest_email
    from public.casa_sessions s
    where o.id=(v_result->>'orderId')::uuid and o.casa_session_id=s.id
      and s.token_hash=extensions.digest(p_session_token,'sha256')
      and o.guest_email is distinct from s.guest_email;
  end if;
  return v_result;
end;
$$;
revoke all on function public.casa_place_order_v5(text,text,text,text[],uuid) from public;
grant execute on function public.casa_place_order_v5(text,text,text,text[],uuid) to anon, authenticated;
commit;
