-- Gold Feather Premium Telegram Mini App + Binance Pay verification
-- These statements were applied to the linked Supabase project on 2026-11-08.

alter table public.bot_settings add column if not exists telegram_bot_id text;
update public.bot_settings set store_name='GOLD FEATHER PREMIUM',
 welcome_message='Welcome to Gold Feather Premium. Explore digital products, subscriptions and secure checkout.',
 payment_instructions='Pay the exact amount to the Gold Feather Premium Binance Pay ID. Submit your Binance transaction ID for automatic verification.'
where id=1;

create table if not exists public.telegram_customers (
 id uuid primary key default gen_random_uuid(),
 telegram_user_id text not null unique,
 first_name text not null,
 last_name text,
 username text,
 photo_url text,
 language_code text,
 binance_id text,
 is_blocked boolean not null default false,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.telegram_customers enable row level security;
grant select on public.telegram_customers to authenticated;
drop policy if exists "admins read telegram customers" on public.telegram_customers;
create policy "admins read telegram customers" on public.telegram_customers for select to authenticated using((select private.is_admin()));

alter table public.orders add column if not exists telegram_customer_id uuid references public.telegram_customers(id);
alter table public.orders add column if not exists telegram_idempotency_key text;
alter table public.payment_submissions add column if not exists telegram_customer_id uuid references public.telegram_customers(id);
alter table public.payment_submissions add column if not exists last_verification_at timestamptz;
alter table public.payment_submissions add column if not exists verification_attempts integer not null default 0;

create index if not exists orders_telegram_customer_idx on public.orders(telegram_customer_id,created_at desc);
create index if not exists payment_submissions_telegram_customer_idx on public.payment_submissions(telegram_customer_id);
create unique index if not exists orders_telegram_idempotency_key_key on public.orders(telegram_customer_id,telegram_idempotency_key) where telegram_idempotency_key is not null;
create unique index if not exists orders_one_open_telegram_order_per_customer on public.orders(telegram_customer_id) where telegram_customer_id is not null and status='awaiting_payment';
create unique index if not exists payment_submissions_one_pending_binance_per_order on public.payment_submissions(order_id) where provider='binance_pay_api' and status='submitted';
create unique index if not exists payment_submissions_binance_txid_ci on public.payment_submissions(lower(transaction_reference)) where provider='binance_pay_api';

create table if not exists public.binance_payment_claims (
 transaction_id text primary key,
 order_id uuid not null unique references public.orders(id),
 telegram_customer_id uuid not null references public.telegram_customers(id),
 amount numeric(24,8) not null,
 currency text not null,
 payer_binance_id text,
 receiver_pay_id text not null,
 transaction_time timestamptz not null,
 raw_transaction jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);
alter table public.binance_payment_claims enable row level security;
grant select on public.binance_payment_claims to authenticated;
drop policy if exists "admins read binance payment claims" on public.binance_payment_claims;
create policy "admins read binance payment claims" on public.binance_payment_claims for select to authenticated using((select private.is_admin()));
create unique index if not exists binance_payment_claims_txid_ci on public.binance_payment_claims(lower(transaction_id));

create table if not exists public.binance_api_request_gate (
 id integer primary key check(id=1),
 next_allowed_at timestamptz not null default '-infinity'
);
alter table public.binance_api_request_gate enable row level security;

create or replace function public.validate_customer_order() returns trigger
language plpgsql set search_path=public as $$
declare p public.products%rowtype; pl public.product_plans%rowtype; request_role text;
begin
 request_role := current_setting('request.jwt.claim.role', true);
 if request_role = 'service_role' then
   if new.customer_id is not null or new.telegram_customer_id is null then raise exception 'Telegram order must be linked to a Telegram customer'; end if;
   if not exists(select 1 from public.telegram_customers tc where tc.id=new.telegram_customer_id and tc.is_blocked=false) then raise exception 'Telegram customer unavailable'; end if;
 else
   if auth.uid() is null or new.customer_id <> auth.uid() then raise exception 'Customer identity mismatch'; end if;
 end if;
 select * into p from public.products where id=new.product_id and is_active=true;
 select * into pl from public.product_plans where id=new.plan_id and product_id=new.product_id and is_active=true;
 if p.id is null or pl.id is null then raise exception 'Product or plan unavailable'; end if;
 if new.amount <> pl.price or new.currency <> pl.currency then raise exception 'Order amount does not match current plan price'; end if;
 new.status := 'awaiting_payment';
 new.fulfillment_mode := p.fulfillment_mode;
 if request_role = 'service_role' then
   select telegram_user_id into new.telegram_user_id from public.telegram_customers where id=new.telegram_customer_id;
 else
   new.telegram_user_id := null;
 end if;
 new.paid_at := null;
 new.fulfilled_at := null;
 new.delivery_data := '{}'::jsonb;
 new.expires_at := now() + interval '2 hours';
 return new;
end; $$;

create or replace function public.validate_payment_submission() returns trigger
language plpgsql set search_path=public as $$
declare o public.orders%rowtype; request_role text;
begin
 request_role := current_setting('request.jwt.claim.role', true);
 if request_role = 'service_role' then
   if new.telegram_customer_id is null then raise exception 'Telegram customer identity required'; end if;
   select * into o from public.orders where id=new.order_id and telegram_customer_id=new.telegram_customer_id;
   if o.id is null then raise exception 'Order ownership mismatch'; end if;
   return new;
 end if;
 if auth.uid() is null or new.customer_id <> auth.uid() then raise exception 'Customer identity mismatch'; end if;
 select * into o from public.orders where id=new.order_id and customer_id=auth.uid();
 if o.id is null or o.status <> 'awaiting_payment' then raise exception 'Order is not eligible for payment submission'; end if;
 if new.amount is not null and new.amount <> o.amount then raise exception 'Submitted amount does not match order'; end if;
 new.amount := o.amount;
 new.currency := o.currency;
 new.status := 'submitted';
 new.reviewed_by := null;
 new.reviewed_at := null;
 new.verification_source := 'manual_review';
 new.verification_payload := '{}'::jsonb;
 return new;
end; $$;

create or replace function public.reserve_binance_pay_history_slot()
returns boolean language plpgsql set search_path=public as $$
declare next_time timestamptz;
begin
 insert into public.binance_api_request_gate(id,next_allowed_at) values(1,'-infinity') on conflict(id) do nothing;
 select next_allowed_at into next_time from public.binance_api_request_gate where id=1 for update;
 if next_time > now() then return false; end if;
 update public.binance_api_request_gate set next_allowed_at=now()+interval '31 seconds' where id=1;
 return true;
end; $$;
revoke all on function public.reserve_binance_pay_history_slot() from public,anon,authenticated;
grant execute on function public.reserve_binance_pay_history_slot() to service_role;

drop function if exists public.record_verified_binance_payment(uuid,uuid,text,numeric,text,text,text,timestamptz,jsonb);
drop function if exists public.record_verified_binance_payment(uuid,uuid,uuid,text,text,text,text,text,timestamptz,jsonb);

create or replace function public.record_verified_binance_payment(
 p_order_id uuid,p_telegram_customer_id uuid,p_payment_submission_id uuid,p_transaction_id text,
 p_amount numeric,p_currency text,p_payer_binance_id text,p_receiver_pay_id text,
 p_transaction_time timestamptz,p_raw_transaction jsonb
) returns jsonb language plpgsql set search_path=public as $$
declare o public.orders%rowtype; secret_payload jsonb; final_status public.order_status;
begin
 select * into o from public.orders where id=p_order_id and telegram_customer_id=p_telegram_customer_id for update;
 if o.id is null then raise exception 'ORDER_NOT_FOUND'; end if;
 if o.status <> 'awaiting_payment' then raise exception 'ORDER_NOT_PAYABLE'; end if;
 if p_transaction_time < o.created_at-interval '2 minutes' or p_transaction_time > o.expires_at+interval '2 minutes' then raise exception 'TRANSACTION_OUTSIDE_ORDER_WINDOW'; end if;
 if o.amount <> p_amount or upper(o.currency) <> upper(p_currency) then raise exception 'AMOUNT_OR_CURRENCY_MISMATCH'; end if;
 insert into public.binance_payment_claims(transaction_id,order_id,telegram_customer_id,amount,currency,payer_binance_id,receiver_pay_id,transaction_time,raw_transaction)
 values(p_transaction_id,p_order_id,p_telegram_customer_id,p_amount,upper(p_currency),p_payer_binance_id,p_receiver_pay_id,p_transaction_time,coalesce(p_raw_transaction,'{}'::jsonb));
 update public.payment_submissions set status='verified',amount=p_amount,currency=upper(p_currency),verification_source='binance_pay_api',
  verification_payload=coalesce(p_raw_transaction,'{}'::jsonb),review_note='Verified automatically against Binance Pay transaction history.',
  last_verification_at=now(),verification_attempts=verification_attempts+1
 where id=p_payment_submission_id and order_id=p_order_id and telegram_customer_id=p_telegram_customer_id
  and provider='binance_pay_api' and transaction_reference=p_transaction_id and status='submitted';
 if not found then raise exception 'PAYMENT_SUBMISSION_NOT_PENDING'; end if;
 if o.fulfillment_mode='automatic' then select payload into secret_payload from public.product_delivery_secrets where product_id=o.product_id; end if;
 if o.fulfillment_mode='automatic' and nullif(secret_payload->>'content','') is not null then
  update public.orders set status='fulfilled',paid_at=now(),fulfilled_at=now(),delivery_data=jsonb_build_object('content',secret_payload->>'content','mode','automatic') where id=p_order_id;
  insert into public.deliveries(order_id,mode,status,payload,delivered_at) values(p_order_id,'automatic','sent',jsonb_build_object('content',secret_payload->>'content','mode','automatic'),now()) on conflict(order_id) do nothing;
  final_status:='fulfilled';
 else
  update public.orders set status='paid',paid_at=now() where id=p_order_id;
  final_status:='paid';
 end if;
 return jsonb_build_object('ok',true,'status',final_status,'order_number',o.order_number);
end; $$;
revoke all on function public.record_verified_binance_payment(uuid,uuid,uuid,text,numeric,text,text,text,timestamptz,jsonb) from public,anon,authenticated;
grant execute on function public.record_verified_binance_payment(uuid,uuid,uuid,text,numeric,text,text,text,timestamptz,jsonb) to service_role;


-- Explicitly deny browser/client access to the global Binance request gate.
drop policy if exists "deny client access to Binance request gate" on public.binance_api_request_gate;
create policy "deny client access to Binance request gate" on public.binance_api_request_gate
 for all to anon,authenticated using(false) with check(false);

-- Split subscription admin policies so SELECT has a single permissive policy.
drop policy if exists "admins manage subscriptions" on public.subscriptions;
create policy "admins insert subscriptions" on public.subscriptions for insert to authenticated with check((select private.is_admin()));
create policy "admins update subscriptions" on public.subscriptions for update to authenticated using((select private.is_admin())) with check((select private.is_admin()));
create policy "admins delete subscriptions" on public.subscriptions for delete to authenticated using((select private.is_admin()));
create index if not exists subscriptions_customer_id_idx on public.subscriptions(customer_id);
create index if not exists subscriptions_plan_id_idx on public.subscriptions(plan_id);
create index if not exists subscriptions_product_id_idx on public.subscriptions(product_id);

create unique index if not exists payment_submissions_binance_reference_global_ci on public.payment_submissions(lower(transaction_reference)) where provider in ('binance_pay_id','binance_pay_api');


alter table public.telegram_customers add column if not exists allows_write_to_pm boolean not null default false;
alter table public.telegram_customers add column if not exists added_to_attachment_menu boolean not null default false;
create unique index if not exists payment_submissions_binance_reference_global_ci
 on public.payment_submissions(lower(transaction_reference))
 where provider in ('binance_pay_id','binance_pay_api');

alter table public.telegram_customers add column if not exists is_premium boolean not null default false;
