create or replace function public.create_telegram_developer_api_key(
  p_customer_id uuid,
  p_name text,
  p_key_prefix text,
  p_key_hash text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_active_count integer;
  v_row public.telegram_developer_api_keys%rowtype;
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_customer_id is null or p_key_hash is null or length(p_key_hash) <> 64
     or p_key_prefix is null or length(p_key_prefix) < 8
     or p_name is null or char_length(trim(p_name)) not between 1 and 60 then
    raise exception 'API_KEY_INPUT_INVALID';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_customer_id::text, 0));
  select count(*) into v_active_count
  from public.telegram_developer_api_keys
  where telegram_customer_id = p_customer_id and revoked_at is null;
  if v_active_count >= 5 then raise exception 'API_KEY_LIMIT_REACHED'; end if;
  insert into public.telegram_developer_api_keys(telegram_customer_id,name,key_prefix,key_hash)
  values(p_customer_id,trim(p_name),p_key_prefix,p_key_hash)
  returning * into v_row;
  return jsonb_build_object('id',v_row.id,'name',v_row.name,'key_prefix',v_row.key_prefix,'created_at',v_row.created_at);
end;
$$;
revoke all on function public.create_telegram_developer_api_key(uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.create_telegram_developer_api_key(uuid,text,text,text) to service_role;
