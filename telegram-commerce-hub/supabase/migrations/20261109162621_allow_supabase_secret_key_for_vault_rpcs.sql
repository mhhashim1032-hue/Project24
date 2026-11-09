CREATE OR REPLACE FUNCTION app_private.is_trusted_supabase_server_call()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_role text;
  v_headers jsonb;
  v_api_key text;
BEGIN
  v_role := coalesce(current_setting('request.jwt.claim.role', true), '');
  IF v_role = 'service_role' THEN
    RETURN true;
  END IF;
  v_headers := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb;
  v_api_key := coalesce(v_headers ->> 'apikey', '');
  RETURN v_api_key ~ '^sb_secret_[A-Za-z0-9_-]+$';
END;
$function$;

REVOKE ALL ON FUNCTION app_private.is_trusted_supabase_server_call() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_get_payment_secret(p_name text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_secret text;
BEGIN
  IF NOT app_private.is_trusted_supabase_server_call() THEN
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
  IF NOT app_private.is_trusted_supabase_server_call() THEN
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
