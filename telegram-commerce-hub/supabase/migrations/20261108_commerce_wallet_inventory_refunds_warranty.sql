-- Nova / Gold Feather Premium commerce extensions
-- Product warranty, quantity pricing, inventory ledger, wallet ledger, refunds and warranty claims.

alter table public.products
  add column if not exists warranty_days integer not null default 0
  check (warranty_days >= 0);

alter table public.product_plans
  add column if not exists quantity_discount_tiers jsonb not null default '[]'::jsonb
  check (jsonb_typeof(quantity_discount_tiers) = 'array');

create table if not exists public.inventory_transactions (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.product_plans(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  transaction_type text not null check (transaction_type in ('stock_added','stock_removed','stock_reserved','stock_released','stock_sold')),
  source text not null default 'admin',
  reference text,
  notes text,
  actor_id uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists inventory_transactions_plan_created_idx on public.inventory_transactions(plan_id, created_at desc);
alter table public.inventory_transactions enable row level security;
drop policy if exists "admins manage inventory transactions" on public.inventory_transactions;
create policy "admins manage inventory transactions" on public.inventory_transactions for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

create table if not exists public.wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  telegram_customer_id uuid not null references public.telegram_customers(id) on delete restrict,
  amount numeric(24,8) not null check (amount > 0),
  currency text not null default 'USDT',
  direction text not null check (direction in ('credit','debit')),
  transaction_type text not null check (transaction_type in ('admin_credit','purchase','refund','adjustment')),
  reference_type text,
  reference_id uuid,
  idempotency_key text unique,
  note text,
  actor_id uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists wallet_transactions_customer_created_idx on public.wallet_transactions(telegram_customer_id, created_at desc);
alter table public.wallet_transactions enable row level security;
drop policy if exists "admins read wallet transactions" on public.wallet_transactions;
create policy "admins read wallet transactions" on public.wallet_transactions for select to authenticated
  using ((select private.is_admin()));

create table if not exists public.refund_requests (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  telegram_customer_id uuid not null references public.telegram_customers(id) on delete restrict,
  amount numeric(24,8) not null check (amount > 0),
  currency text not null,
  reason text not null,
  status text not null default 'submitted' check (status in ('submitted','approved','rejected','refunded')),
  refund_method text check (refund_method in ('wallet','external')),
  admin_note text,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists refund_requests_status_created_idx on public.refund_requests(status,created_at desc);
alter table public.refund_requests enable row level security;
drop policy if exists "admins manage refund requests" on public.refund_requests;
create policy "admins manage refund requests" on public.refund_requests for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

create table if not exists public.warranty_claims (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  telegram_customer_id uuid not null references public.telegram_customers(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  reason text not null,
  evidence_url text,
  status text not null default 'submitted' check (status in ('submitted','approved','rejected','resolved')),
  resolution text,
  admin_note text,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists warranty_claims_one_per_order_idx on public.warranty_claims(order_id);
create index if not exists warranty_claims_status_created_idx on public.warranty_claims(status,created_at desc);
alter table public.warranty_claims enable row level security;
drop policy if exists "admins manage warranty claims" on public.warranty_claims;
create policy "admins manage warranty claims" on public.warranty_claims for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

create or replace function public.admin_adjust_stock(
  p_plan_id uuid, p_quantity integer, p_action text default 'add',
  p_notes text default null, p_reference text default null
) returns integer language plpgsql security definer set search_path=public as $$
declare current_stock integer; next_stock integer;
begin
  if not private.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  if p_quantity is null or p_quantity <= 0 or p_action not in ('add','remove') then raise exception 'INVALID_STOCK_ADJUSTMENT'; end if;
  select stock into current_stock from public.product_plans where id=p_plan_id for update;
  if not found then raise exception 'PLAN_NOT_FOUND'; end if;
  if current_stock is null and p_action='remove' then raise exception 'UNLIMITED_STOCK_CANNOT_BE_REMOVED'; end if;
  next_stock := coalesce(current_stock,0) + case when p_action='add' then p_quantity else -p_quantity end;
  if next_stock < 0 then raise exception 'INSUFFICIENT_STOCK'; end if;
  update public.product_plans set stock=next_stock where id=p_plan_id;
  insert into public.inventory_transactions(plan_id,quantity,transaction_type,source,reference,notes,actor_id)
  values(p_plan_id,p_quantity,case when p_action='add' then 'stock_added' else 'stock_removed' end,'admin',p_reference,p_notes,auth.uid());
  return next_stock;
end $$;
revoke all on function public.admin_adjust_stock(uuid,integer,text,text,text) from public,anon;
grant execute on function public.admin_adjust_stock(uuid,integer,text,text,text) to authenticated;

create or replace function public.admin_credit_wallet(
  p_customer_id uuid, p_amount numeric, p_currency text default 'USDT',
  p_note text default null, p_idempotency_key text default null
) returns uuid language plpgsql security definer set search_path=public as $$
declare tx uuid;
begin
  if not private.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'INVALID_AMOUNT'; end if;
  insert into public.wallet_transactions(telegram_customer_id,amount,currency,direction,transaction_type,idempotency_key,note,actor_id)
  values(p_customer_id,p_amount,upper(p_currency),'credit','admin_credit',p_idempotency_key,p_note,auth.uid())
  on conflict(idempotency_key) do nothing returning id into tx;
  if tx is null and p_idempotency_key is not null then select id into tx from public.wallet_transactions where idempotency_key=p_idempotency_key; end if;
  return tx;
end $$;
revoke all on function public.admin_credit_wallet(uuid,numeric,text,text,text) from public,anon;
grant execute on function public.admin_credit_wallet(uuid,numeric,text,text,text) to authenticated;

create or replace function public.get_wallet_balance(p_customer_id uuid)
returns table(currency text,balance numeric) language sql security definer set search_path=public as $$
  select wt.currency,sum(case when wt.direction='credit' then wt.amount else -wt.amount end)
  from public.wallet_transactions wt where wt.telegram_customer_id=p_customer_id group by wt.currency
$$;
revoke all on function public.get_wallet_balance(uuid) from public,anon,authenticated;
grant execute on function public.get_wallet_balance(uuid) to service_role;

create or replace function public.submit_warranty_claim(
  p_order_id uuid,p_customer_id uuid,p_reason text,p_evidence_url text default null
) returns uuid language plpgsql security definer set search_path=public as $$
declare o public.orders%rowtype; warranty integer; claim_id uuid;
begin
  select * into o from public.orders where id=p_order_id and telegram_customer_id=p_customer_id and status in ('paid','fulfilled') for update;
  if not found then raise exception 'ELIGIBLE_ORDER_NOT_FOUND'; end if;
  select warranty_days into warranty from public.products where id=o.product_id;
  if coalesce(warranty,0)<=0 then raise exception 'WARRANTY_NOT_OFFERED'; end if;
  if o.paid_at is null or now()>o.paid_at+make_interval(days=>warranty) then raise exception 'WARRANTY_EXPIRED'; end if;
  insert into public.warranty_claims(order_id,telegram_customer_id,product_id,reason,evidence_url)
  values(o.id,p_customer_id,o.product_id,left(trim(p_reason),2000),p_evidence_url) returning id into claim_id;
  return claim_id;
end $$;
revoke all on function public.submit_warranty_claim(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.submit_warranty_claim(uuid,uuid,text,text) to service_role;
