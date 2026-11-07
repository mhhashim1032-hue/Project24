-- Wallet recharge auto-verification ledger and idempotent wallet crediting.
create table if not exists public.wallet_recharge_requests (
  id uuid primary key default gen_random_uuid(),
  telegram_customer_id uuid not null references public.telegram_customers(id) on delete cascade,
  amount numeric(20,8) not null check (amount > 0 and amount <= 10000),
  currency text not null default 'USDT' check (upper(currency) = 'USDT'),
  provider text not null check (provider in ('usdt_tron','binance_pay_api')),
  transaction_reference text not null,
  status text not null default 'pending' check (status in ('pending','verified','rejected')),
  verification_source text,
  verification_payload jsonb not null default '{}'::jsonb,
  review_note text,
  verification_attempts integer not null default 0,
  last_verification_at timestamptz,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists wallet_recharge_provider_reference_uidx
  on public.wallet_recharge_requests(provider, lower(transaction_reference));
create index if not exists wallet_recharge_customer_created_idx
  on public.wallet_recharge_requests(telegram_customer_id, created_at desc);
alter table public.wallet_recharge_requests enable row level security;
revoke all on public.wallet_recharge_requests from anon, authenticated;
grant all on public.wallet_recharge_requests to service_role;

create or replace function public.credit_verified_wallet_recharge(
  p_recharge_id uuid,p_provider text,p_transaction_reference text,p_amount numeric,p_currency text,p_payload jsonb
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare r public.wallet_recharge_requests%rowtype; tx uuid;
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  select * into r from public.wallet_recharge_requests where id=p_recharge_id for update;
  if r.id is null then raise exception 'RECHARGE_NOT_FOUND'; end if;
  if r.status='verified' then
    select id into tx from public.wallet_transactions where idempotency_key='wallet-recharge:'||r.id::text;
    return jsonb_build_object('ok',true,'status','verified','already_credited',true,'transaction_id',tx);
  end if;
  if r.status <> 'pending' then raise exception 'RECHARGE_NOT_PENDING'; end if;
  if r.provider <> p_provider or lower(r.transaction_reference) <> lower(p_transaction_reference) then raise exception 'RECHARGE_REFERENCE_MISMATCH'; end if;
  if r.amount <> p_amount or upper(r.currency) <> upper(p_currency) or upper(p_currency) <> 'USDT' then raise exception 'RECHARGE_AMOUNT_MISMATCH'; end if;
  update public.wallet_recharge_requests set status='verified',verification_source=p_provider,
    verification_payload=coalesce(p_payload,'{}'::jsonb),review_note='Automatically verified against the payment provider.',
    verified_at=now(),updated_at=now(),last_verification_at=now(),verification_attempts=verification_attempts+1
    where id=r.id;
  insert into public.wallet_transactions(telegram_customer_id,amount,currency,direction,transaction_type,reference_type,reference_id,idempotency_key,note)
  values(r.telegram_customer_id,r.amount,'USDT','credit','wallet_recharge','wallet_recharge',r.id,
    'wallet-recharge:'||r.id::text,'Automatically verified wallet recharge via '||r.provider)
  on conflict(idempotency_key) do nothing returning id into tx;
  if tx is null then select id into tx from public.wallet_transactions where idempotency_key='wallet-recharge:'||r.id::text; end if;
  insert into public.audit_logs(action,entity_type,entity_id,metadata)
  values('wallet_recharge_verified','wallet_recharge',r.id::text,
    jsonb_build_object('provider',r.provider,'amount',r.amount,'currency','USDT','transaction_reference',r.transaction_reference));
  return jsonb_build_object('ok',true,'status','verified','already_credited',false,'transaction_id',tx);
end;
$$;
revoke all on function public.credit_verified_wallet_recharge(uuid,text,text,numeric,text,jsonb) from public,anon,authenticated;
grant execute on function public.credit_verified_wallet_recharge(uuid,text,text,numeric,text,jsonb) to service_role;
