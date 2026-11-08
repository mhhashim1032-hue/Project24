-- Multi-pending-order checkout support for Gold Feather Telegram Mini App.
-- Remove the legacy one-open-order-per-customer constraint and add safe order edit/cancel RPCs.

drop index if exists public.orders_one_open_telegram_order_per_customer;
create index if not exists orders_telegram_pending_expiry_idx
  on public.orders (expires_at, telegram_customer_id)
  where status = 'awaiting_payment'::public.order_status;
create index if not exists orders_telegram_customer_pending_created_idx
  on public.orders (telegram_customer_id, created_at desc)
  where status = 'awaiting_payment'::public.order_status;
create index if not exists payment_submissions_order_status_idx
  on public.payment_submissions (order_id, status, created_at desc);

create or replace function public.create_telegram_order_quantity_service(
 p_telegram_customer_id uuid,p_plan_id uuid,p_idempotency_key text,p_quantity integer
) returns jsonb language plpgsql security definer set search_path=public as $$
declare c public.telegram_customers%rowtype; pl public.product_plans%rowtype; p public.products%rowtype; o public.orders%rowtype; expired record; total numeric;
begin
 if coalesce(auth.role(),'') <> 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
 if coalesce(p_idempotency_key,'') !~* '^[0-9a-f-]{36}$' then raise exception 'INVALID_IDEMPOTENCY_KEY'; end if;
 if p_quantity is null or p_quantity<1 or p_quantity>1000 then raise exception 'INVALID_QUANTITY'; end if;
 select * into c from public.telegram_customers where id=p_telegram_customer_id for update;
 if c.id is null or c.is_blocked then raise exception 'CUSTOMER_NOT_READY'; end if;
 select * into o from public.orders where telegram_customer_id=c.id and telegram_idempotency_key=p_idempotency_key;
 if o.id is not null then
   return jsonb_build_object('id',o.id,'order_number',o.order_number,'amount',o.amount,'currency',o.currency,'status',o.status,'quantity',o.quantity,'created_at',o.created_at,'expires_at',o.expires_at,'payment_deadline_at',o.payment_deadline_at,'product_id',o.product_id,'plan_id',o.plan_id);
 end if;
 for expired in select id,plan_id,quantity from public.orders
   where telegram_customer_id=c.id and status='awaiting_payment' and expires_at<=now() for update
 loop
   update public.orders set status='cancelled',updated_at=now() where id=expired.id and status='awaiting_payment';
   if found then
     update public.payment_submissions set status='rejected',review_note='Order expired before payment verification'
       where order_id=expired.id and status='submitted';
     update public.product_plans set stock=stock+expired.quantity where id=expired.plan_id and stock is not null;
   end if;
 end loop;
 select * into pl from public.product_plans where id=p_plan_id and is_active=true for update;
 if pl.id is null then raise exception 'PLAN_UNAVAILABLE'; end if;
 select * into p from public.products where id=pl.product_id and is_active=true;
 if p.id is null then raise exception 'PRODUCT_UNAVAILABLE'; end if;
 if pl.stock is not null then
   update public.product_plans set stock=stock-p_quantity where id=pl.id and stock>=p_quantity returning * into pl;
   if not found then raise exception 'OUT_OF_STOCK'; end if;
 end if;
 total:=public.calculate_plan_total(pl.id,p_quantity);
 insert into public.orders(customer_id,telegram_customer_id,telegram_user_id,telegram_idempotency_key,product_id,plan_id,quantity,amount,currency,fulfillment_mode,status)
 values(null,c.id,c.telegram_user_id,p_idempotency_key,p.id,pl.id,p_quantity,total,pl.currency,p.fulfillment_mode,'awaiting_payment')
 returning * into o;
 insert into public.inventory_transactions(plan_id,quantity,transaction_type,source,reference,notes)
 values(pl.id,p_quantity,'stock_reserved','order',o.order_number,'Stock reserved for 30-minute Telegram checkout');
 return jsonb_build_object('id',o.id,'order_number',o.order_number,'amount',o.amount,'currency',o.currency,'status',o.status,'quantity',o.quantity,'created_at',o.created_at,'expires_at',o.expires_at,'payment_deadline_at',o.payment_deadline_at,'product_id',o.product_id,'plan_id',o.plan_id,'product_name',p.name);
end; $$;

create or replace function public.modify_telegram_order(p_order_id uuid,p_customer_id uuid,p_plan_id uuid,p_quantity integer)
returns jsonb language plpgsql security definer set search_path=public as $$
declare o public.orders%rowtype; old_pl public.product_plans%rowtype; new_pl public.product_plans%rowtype;
 new_product public.products%rowtype; total numeric; new_deadline timestamptz;
begin
 if coalesce(auth.role(),'') <> 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
 if p_quantity is null or p_quantity<1 or p_quantity>1000 then raise exception 'INVALID_QUANTITY'; end if;
 select * into o from public.orders where id=p_order_id and telegram_customer_id=p_customer_id for update;
 if o.id is null then raise exception 'ORDER_NOT_FOUND'; end if;
 if o.status<>'awaiting_payment' or o.expires_at<=now() then raise exception 'ORDER_NOT_EDITABLE'; end if;
 if exists(select 1 from public.payment_submissions where order_id=o.id and status in ('submitted','verified')) then raise exception 'PAYMENT_ALREADY_SUBMITTED'; end if;
 select * into new_pl from public.product_plans where id=p_plan_id and is_active=true;
 if new_pl.id is null then raise exception 'PLAN_UNAVAILABLE'; end if;
 select * into new_product from public.products where id=new_pl.product_id and is_active=true;
 if new_product.id is null then raise exception 'PRODUCT_UNAVAILABLE'; end if;
 perform 1 from public.product_plans where id in (o.plan_id,new_pl.id) order by id for update;
 select * into new_pl from public.product_plans where id=p_plan_id and is_active=true;
 select * into old_pl from public.product_plans where id=o.plan_id;
 if old_pl.id=new_pl.id then
   if new_pl.stock is not null and p_quantity>o.quantity then
     update public.product_plans set stock=stock-(p_quantity-o.quantity) where id=new_pl.id and stock >= (p_quantity-o.quantity);
     if not found then raise exception 'OUT_OF_STOCK'; end if;
   elsif new_pl.stock is not null and p_quantity<o.quantity then
     update public.product_plans set stock=stock+(o.quantity-p_quantity) where id=new_pl.id;
   end if;
   if p_quantity>o.quantity then
     insert into public.inventory_transactions(plan_id,quantity,transaction_type,source,reference,notes)
       values(new_pl.id,p_quantity-o.quantity,'stock_reserved','order_edit',o.order_number,'Additional stock reserved after order edit');
   elsif p_quantity<o.quantity then
     insert into public.inventory_transactions(plan_id,quantity,transaction_type,source,reference,notes)
       values(new_pl.id,o.quantity-p_quantity,'stock_released','order_edit',o.order_number,'Excess stock released after order edit');
   end if;
 else
   if old_pl.stock is not null then update public.product_plans set stock=stock+o.quantity where id=old_pl.id; end if;
   if new_pl.stock is not null then
     update public.product_plans set stock=stock-p_quantity where id=new_pl.id and stock>=p_quantity;
     if not found then raise exception 'OUT_OF_STOCK'; end if;
   end if;
   insert into public.inventory_transactions(plan_id,quantity,transaction_type,source,reference,notes)
     values(old_pl.id,o.quantity,'stock_released','order_edit',o.order_number,'Old plan reservation released after order edit');
   insert into public.inventory_transactions(plan_id,quantity,transaction_type,source,reference,notes)
     values(new_pl.id,p_quantity,'stock_reserved','order_edit',o.order_number,'New plan reservation after order edit');
 end if;
 total:=public.calculate_plan_total(new_pl.id,p_quantity);
 new_deadline:=now()+interval '30 minutes';
 update public.orders set product_id=new_pl.product_id,plan_id=new_pl.id,quantity=p_quantity,amount=total,currency=new_pl.currency,
   expires_at=new_deadline,payment_deadline_at=new_deadline,payment_method=null,updated_at=now()
 where id=o.id returning * into o;
 return jsonb_build_object('id',o.id,'order_number',o.order_number,'amount',o.amount,'currency',o.currency,'status',o.status,
   'quantity',o.quantity,'created_at',o.created_at,'expires_at',o.expires_at,'payment_deadline_at',o.payment_deadline_at,
   'product_id',o.product_id,'plan_id',o.plan_id,'product_name',new_product.name,'edited',true);
end; $$;

create or replace function public.cancel_telegram_order(p_order_id uuid,p_customer_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare o public.orders%rowtype;
begin
 if coalesce(auth.role(),'') <> 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
 select * into o from public.orders where id=p_order_id and telegram_customer_id=p_customer_id for update;
 if o.id is null then raise exception 'ORDER_NOT_FOUND'; end if;
 if o.status<>'awaiting_payment' then raise exception 'ORDER_NOT_CANCELLABLE'; end if;
 update public.payment_submissions set status='rejected',review_note='Order cancelled by customer before payment completion'
   where order_id=o.id and status='submitted';
 update public.orders set status='cancelled',updated_at=now() where id=o.id;
 update public.product_plans set stock=stock+o.quantity where id=o.plan_id and stock is not null;
 return jsonb_build_object('ok',true,'order_id',o.id,'status','cancelled','released_quantity',o.quantity);
end; $$;

revoke all on function public.modify_telegram_order(uuid,uuid,uuid,integer) from public,anon,authenticated;
revoke all on function public.cancel_telegram_order(uuid,uuid) from public,anon,authenticated;
grant execute on function public.modify_telegram_order(uuid,uuid,uuid,integer) to service_role;
grant execute on function public.cancel_telegram_order(uuid,uuid) to service_role;

-- Serialize wallet debits per Telegram customer so two concurrent pending orders
-- cannot both spend the same balance.
create index if not exists wallet_transactions_customer_currency_idx
  on public.wallet_transactions (telegram_customer_id, upper(currency))
  include (amount,direction);

create or replace function public.pay_telegram_order_from_wallet(p_order_id uuid,p_customer_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare o public.orders%rowtype; c public.telegram_customers%rowtype; balance numeric; prod public.products%rowtype; secret jsonb; final_status public.order_status;
begin
 if coalesce(auth.role(),'') <> 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
 select * into o from public.orders where id=p_order_id and telegram_customer_id=p_customer_id for update;
 if o.id is null or o.status<>'awaiting_payment' or o.expires_at<=now() then raise exception 'ORDER_NOT_PAYABLE_OR_EXPIRED'; end if;
 select * into c from public.telegram_customers where id=p_customer_id for update;
 if c.id is null or c.is_blocked then raise exception 'CUSTOMER_NOT_ELIGIBLE'; end if;
 if exists(select 1 from public.wallet_transactions where idempotency_key='order-wallet:'||o.id::text) then
   return jsonb_build_object('ok',true,'status',o.status,'already_paid',true);
 end if;
 select coalesce(sum(case when direction='credit' then amount else -amount end),0) into balance
 from public.wallet_transactions where telegram_customer_id=p_customer_id and upper(currency)=upper(o.currency);
 if balance<o.amount then raise exception 'INSUFFICIENT_WALLET_BALANCE'; end if;
 insert into public.wallet_transactions(telegram_customer_id,amount,currency,direction,transaction_type,reference_type,reference_id,idempotency_key,note)
 values(p_customer_id,o.amount,upper(o.currency),'debit','purchase','order',o.id,'order-wallet:'||o.id::text,'Wallet payment for order '||o.order_number);
 insert into public.payment_submissions(order_id,telegram_customer_id,provider,transaction_reference,amount,currency,status,verification_source,review_note)
 values(o.id,p_customer_id,'wallet','WALLET:'||o.id::text,o.amount,upper(o.currency),'verified','wallet_ledger','Paid from customer wallet')
 on conflict do nothing;
 select * into prod from public.products where id=o.product_id;
 if prod.fulfillment_mode='automatic' then select payload into secret from public.product_delivery_secrets where product_id=o.product_id; end if;
 if prod.fulfillment_mode='automatic' and nullif(secret->>'content','') is not null then
   update public.orders set status='fulfilled',payment_method='wallet',paid_at=now(),fulfilled_at=now(),
     delivery_data=jsonb_build_object('content',secret->>'content','mode','automatic') where id=o.id;
   insert into public.deliveries(order_id,mode,status,payload,delivered_at)
   values(o.id,'automatic','sent',jsonb_build_object('content',secret->>'content','mode','automatic'),now())
   on conflict(order_id) do nothing;
   final_status:='fulfilled';
 else
   update public.orders set status='paid',payment_method='wallet',paid_at=now() where id=o.id;
   final_status:='paid';
 end if;
 return jsonb_build_object('ok',true,'status',final_status,'order_number',o.order_number,'balance_after',balance-o.amount);
end; $$;

-- Do not release a reserved order while a payment reference is being verified.
create or replace function public.cancel_telegram_order(p_order_id uuid,p_customer_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare o public.orders%rowtype;
begin
 if coalesce(auth.role(),'') <> 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
 select * into o from public.orders where id=p_order_id and telegram_customer_id=p_customer_id for update;
 if o.id is null then raise exception 'ORDER_NOT_FOUND'; end if;
 if o.status<>'awaiting_payment' then raise exception 'ORDER_NOT_CANCELLABLE'; end if;
 if exists(select 1 from public.payment_submissions where order_id=o.id and status in ('submitted','verified')) then
   raise exception 'PAYMENT_ALREADY_SUBMITTED';
 end if;
 update public.orders set status='cancelled',updated_at=now() where id=o.id;
 update public.product_plans set stock=stock+o.quantity where id=o.plan_id and stock is not null;
 return jsonb_build_object('ok',true,'order_id',o.id,'status','cancelled','released_quantity',o.quantity);
end; $$;
