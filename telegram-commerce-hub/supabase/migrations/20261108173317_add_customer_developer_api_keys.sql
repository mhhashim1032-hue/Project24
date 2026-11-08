create table if not exists public.telegram_developer_api_keys (
  id uuid primary key default gen_random_uuid(),
  telegram_customer_id uuid not null references public.telegram_customers(id) on delete cascade,
  name text not null default 'Default key' check (char_length(trim(name)) between 1 and 60),
  key_prefix text not null,
  key_hash text not null unique,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
create index if not exists telegram_developer_api_keys_customer_created_idx
  on public.telegram_developer_api_keys(telegram_customer_id, created_at desc);
alter table public.telegram_developer_api_keys enable row level security;
revoke all on table public.telegram_developer_api_keys from public, anon, authenticated;
grant all on table public.telegram_developer_api_keys to service_role;
drop policy if exists "service role manages developer api keys" on public.telegram_developer_api_keys;
create policy "service role manages developer api keys"
on public.telegram_developer_api_keys
for all to service_role
using (true) with check (true);
