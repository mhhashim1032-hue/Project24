-- Store read-only Binance credentials in Supabase Vault, never in public bot_settings.
create schema if not exists app_private;
revoke all on schema app_private from public, anon, authenticated;

create table if not exists app_private.admin_secret_registry (
  name text primary key check (name in ('binance_api_key','binance_api_secret')),
  vault_secret_id uuid not null unique,
  updated_at timestamptz not null default now()
);
revoke all on app_private.admin_secret_registry from public, anon, authenticated;

create or replace function public.admin_set_payment_secret(p_name text, p_secret text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  if p_name not in ('binance_api_key','binance_api_secret') then raise exception 'SECRET_NAME_NOT_ALLOWED'; end if;
  if p_secret is null or length(trim(p_secret)) < 8 then raise exception 'SECRET_VALUE_INVALID'; end if;
  select vault_secret_id into v_id from app_private.admin_secret_registry where name = p_name;
  if v_id is null then
    v_id := vault.create_secret(p_secret, p_name, 'Gold Feather Premium read-only Binance API credential');
    insert into app_private.admin_secret_registry(name, vault_secret_id, updated_at)
    values (p_name, v_id, now())
    on conflict (name) do update set vault_secret_id = excluded.vault_secret_id, updated_at = now();
  else
    perform vault.update_secret(v_id, p_secret, p_name, 'Gold Feather Premium read-only Binance API credential');
    update app_private.admin_secret_registry set updated_at = now() where name = p_name;
  end if;
end;
$$;

create or replace function public.admin_get_payment_secret(p_name text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_secret text;
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  if p_name not in ('binance_api_key','binance_api_secret') then raise exception 'SECRET_NAME_NOT_ALLOWED'; end if;
  select ds.decrypted_secret into v_secret
  from app_private.admin_secret_registry r
  join vault.decrypted_secrets ds on ds.id = r.vault_secret_id
  where r.name = p_name;
  return v_secret;
end;
$$;

revoke all on function public.admin_set_payment_secret(text,text) from public, anon, authenticated;
revoke all on function public.admin_get_payment_secret(text) from public, anon, authenticated;
grant execute on function public.admin_set_payment_secret(text,text) to service_role;
grant execute on function public.admin_get_payment_secret(text) to service_role;
