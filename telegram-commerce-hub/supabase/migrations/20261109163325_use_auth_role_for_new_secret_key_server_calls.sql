-- Use Supabase's normalized role claim for new secret-key JWTs.
-- Supabase's API gateway mints a short-lived service_role JWT from the sb_secret_ apikey header.
-- auth.role() checks both legacy request.jwt.claim.role and the normalized request.jwt.claims JSON.

CREATE OR REPLACE FUNCTION public.admin_get_payment_secret(p_name text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_secret text;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'SERVICE_ROLE_REQUIRED';
  END IF;
  IF p_name NOT IN ('binance_api_key','binance_api_secret','telegram_bot_token') THEN
    RAISE EXCEPTION 'SECRET_NAME_NOT_ALLOWED';
  END IF;
  SELECT ds.decrypted_secret INTO v_secret
  FROM app_private.admin_secret_registry r
  JOIN vault.decrypted_secrets ds ON ds.id = r.vault_secret_id
  WHERE r.name = p_name;
  RETURN v_secret;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_set_payment_secret(p_name text, p_secret text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_id uuid;
  v_description text;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'SERVICE_ROLE_REQUIRED';
  END IF;
  IF p_name NOT IN ('binance_api_key','binance_api_secret','telegram_bot_token') THEN
    RAISE EXCEPTION 'SECRET_NAME_NOT_ALLOWED';
  END IF;
  IF p_secret IS NULL OR length(trim(p_secret)) < 8 THEN
    RAISE EXCEPTION 'SECRET_VALUE_INVALID';
  END IF;
  v_description := CASE
    WHEN p_name = 'telegram_bot_token' THEN 'Gold Feather Premium Telegram bot token'
    ELSE 'Gold Feather Premium read-only Binance API credential'
  END;
  SELECT vault_secret_id INTO v_id
  FROM app_private.admin_secret_registry
  WHERE name = p_name;
  IF v_id IS NULL THEN
    v_id := vault.create_secret(p_secret, p_name, v_description);
    INSERT INTO app_private.admin_secret_registry(name, vault_secret_id, updated_at)
    VALUES (p_name, v_id, now())
    ON CONFLICT (name) DO UPDATE
      SET vault_secret_id = excluded.vault_secret_id, updated_at = now();
  ELSE
    PERFORM vault.update_secret(v_id, p_secret, p_name, v_description);
    UPDATE app_private.admin_secret_registry
    SET updated_at = now()
    WHERE name = p_name;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_telegram_developer_api_key(
  p_customer_id uuid,
  p_name text,
  p_key_prefix text,
  p_key_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_active_count integer;
  v_row public.telegram_developer_api_keys%rowtype;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'SERVICE_ROLE_REQUIRED';
  END IF;
  IF p_customer_id IS NULL OR p_key_hash IS NULL OR length(p_key_hash) <> 64
     OR p_key_prefix IS NULL OR length(p_key_prefix) < 8
     OR p_name IS NULL OR char_length(trim(p_name)) NOT BETWEEN 1 AND 60 THEN
    RAISE EXCEPTION 'API_KEY_INPUT_INVALID';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_customer_id::text, 0));
  SELECT count(*) INTO v_active_count
  FROM public.telegram_developer_api_keys
  WHERE telegram_customer_id = p_customer_id AND revoked_at IS NULL;
  IF v_active_count >= 5 THEN RAISE EXCEPTION 'API_KEY_LIMIT_REACHED'; END IF;
  INSERT INTO public.telegram_developer_api_keys(telegram_customer_id,name,key_prefix,key_hash)
  VALUES(p_customer_id,trim(p_name),p_key_prefix,p_key_hash)
  RETURNING * INTO v_row;
  RETURN jsonb_build_object('id',v_row.id,'name',v_row.name,'key_prefix',v_row.key_prefix,'created_at',v_row.created_at);
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_set_payment_secret(text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_get_payment_secret(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_payment_secret(text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_get_payment_secret(text) TO service_role;

REVOKE ALL ON FUNCTION public.create_telegram_developer_api_key(uuid,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_telegram_developer_api_key(uuid,text,text,text) TO service_role;

DROP FUNCTION app_private.is_trusted_supabase_server_call();
