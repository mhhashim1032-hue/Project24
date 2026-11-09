-- Product-specific customer intake and verified-payment fulfillment routing.
alter table public.products
  add column if not exists delivery_form_schema jsonb not null default '[]'::jsonb;
alter table public.products
  add column if not exists delivery_instructions text not null default '';
do $ begin
  if not exists (select 1 from pg_constraint where conname='products_delivery_form_schema_array' and conrelid='public.products'::regclass) then
    alter table public.products add constraint products_delivery_form_schema_array check (jsonb_typeof(delivery_form_schema) = 'array');
  end if;
end $;
alter table public.orders
  add column if not exists delivery_form_schema jsonb not null default '[]'::jsonb;
alter table public.orders
  add column if not exists delivery_form_data jsonb not null default '{}'::jsonb;
alter table public.orders
  add column if not exists delivery_instructions text not null default '';
alter table public.orders
  add column if not exists delivery_requested_at timestamptz;
alter table public.orders
  add column if not exists delivery_admin_note text;
alter table public.orders
  add column if not exists delivery_completed_by uuid references auth.users(id);
alter table public.orders
  add column if not exists delivery_updated_at timestamptz;
do $ begin
  if not exists (select 1 from pg_constraint where conname='orders_delivery_form_schema_array' and conrelid='public.orders'::regclass) then
    alter table public.orders add constraint orders_delivery_form_schema_array check (jsonb_typeof(delivery_form_schema) = 'array');
  end if;
  if not exists (select 1 from pg_constraint where conname='orders_delivery_form_data_object' and conrelid='public.orders'::regclass) then
    alter table public.orders add constraint orders_delivery_form_data_object check (jsonb_typeof(delivery_form_data) = 'object');
  end if;
end $;

create or replace function public.process_paid_telegram_order(p_order_id uuid)
returns jsonb language plpgsql security definer
set search_path = public, private, pg_temp as $$
declare
  o public.orders%rowtype;
  p public.products%rowtype;
  creds jsonb := '[]'::jsonb;
  assigned_count integer := 0;
  required_count integer := 1;
  schema_snapshot jsonb := '[]'::jsonb;
  mode_value text;
begin
  if auth.role() <> 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  select * into o from public.orders where id=p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if o.status='fulfilled' then
    return jsonb_build_object('status','fulfilled','already_fulfilled',true,'delivery_data',o.delivery_data);
  end if;
  if o.status not in ('paid','fulfillment_pending') then raise exception 'ORDER_NOT_PAID'; end if;
  select * into p from public.products where id=o.product_id;
  if not found then raise exception 'PRODUCT_NOT_FOUND'; end if;
  required_count:=greatest(coalesce(o.quantity,1),1);
  schema_snapshot:=case when jsonb_typeof(p.delivery_form_schema)='array' then p.delivery_form_schema else '[]'::jsonb end;
  mode_value:=coalesce(p.fulfillment_mode::text,'manual');

  if mode_value='automatic' then
    with picked as (
      select id from public.product_plan_credentials
      where plan_id=o.plan_id and product_id=o.product_id and status='available'
      order by created_at,id for update skip locked limit required_count
    ), changed as (
      update public.product_plan_credentials c
      set status='assigned',assigned_order_id=o.id,assigned_at=now()
      where c.id in(select id from picked)
      returning c.credential_data,c.created_at
    )
    select count(*),coalesce(jsonb_agg(credential_data order by created_at),'[]'::jsonb)
    into assigned_count,creds from changed;

    if assigned_count=required_count then
      -- Telegram checkout already reserved plan.stock at order creation; do not decrement it twice.
      update public.orders set status='fulfilled',paid_at=coalesce(paid_at,now()),
        fulfilled_at=now(),delivery_data=jsonb_build_object('mode','account_credentials','credentials',creds),
        delivery_form_schema=schema_snapshot,delivery_instructions=coalesce(p.delivery_instructions,''),
        delivery_updated_at=now()
      where id=o.id;
      insert into public.deliveries(order_id,mode,status,payload,delivered_at)
      values(o.id,'automatic','sent',jsonb_build_object('mode','account_credentials','credentials',creds),now())
      on conflict(order_id) do update set mode='automatic',status='sent',payload=excluded.payload,delivered_at=excluded.delivered_at;
      return jsonb_build_object('status','fulfilled','mode','automatic','credentials_count',assigned_count);
    end if;
    update public.product_plan_credentials
    set status='available',assigned_order_id=null,assigned_at=null
    where assigned_order_id=o.id and status='assigned';
  end if;

  update public.orders set status='fulfillment_pending',paid_at=coalesce(paid_at,now()),
    fulfillment_mode='manual',delivery_form_schema=schema_snapshot,
    delivery_instructions=coalesce(p.delivery_instructions,''),
    delivery_requested_at=coalesce(delivery_requested_at,now()),delivery_updated_at=now()
  where id=o.id;
  insert into public.deliveries(order_id,mode,status,payload)
  values(o.id,'manual','queued',jsonb_build_object('mode','manual','form_schema',schema_snapshot))
  on conflict(order_id) do update set mode='manual',status='queued',payload=excluded.payload,delivered_at=null;
  return jsonb_build_object('status','fulfillment_pending','mode','manual',
    'reason',case when mode_value='automatic' then 'credential_stock_unavailable' else 'manual_fulfillment_configured' end,
    'form_schema',schema_snapshot);
end;
$$;

revoke all on function public.process_paid_telegram_order(uuid) from public,anon,authenticated;
grant execute on function public.process_paid_telegram_order(uuid) to service_role;

-- Preserve the existing website allocation stock behavior, but avoid a second deduction
-- for Telegram orders whose plan stock was reserved by create_telegram_order_quantity_service.
create or replace function public.admin_assign_plan_credentials(p_order_id uuid)
returns jsonb language plpgsql security definer
set search_path = public, private as $function$
declare v_order public.orders%rowtype; v_count integer; v_credentials jsonb; v_stock integer;
begin
 if not private.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
 select * into v_order from public.orders where id=p_order_id for update;
 if not found then raise exception 'ORDER_NOT_FOUND'; end if;
 if v_order.status not in ('paid','fulfillment_pending') then raise exception 'ORDER_NOT_READY_FOR_DELIVERY'; end if;
 if exists(select 1 from public.product_plan_credentials where assigned_order_id=p_order_id and status='assigned') then
  select jsonb_agg(credential_data order by created_at) into v_credentials from public.product_plan_credentials where assigned_order_id=p_order_id and status='assigned';
  return jsonb_build_object('credentials',coalesce(v_credentials,'[]'::jsonb),'already_assigned',true);
 end if;
 with picked as (select id from public.product_plan_credentials where plan_id=v_order.plan_id and status='available' order by created_at,id for update skip locked limit greatest(coalesce(v_order.quantity,1),1)),
 updated as (update public.product_plan_credentials c set status='assigned',assigned_order_id=p_order_id,assigned_at=now() where c.id in(select id from picked) returning c.credential_data,c.created_at)
 select count(*),jsonb_agg(credential_data order by created_at) into v_count,v_credentials from updated;
 if v_count<greatest(coalesce(v_order.quantity,1),1) then raise exception 'INSUFFICIENT_CREDENTIAL_STOCK'; end if;
 if v_order.telegram_customer_id is null then
  select stock into v_stock from public.product_plans where id=v_order.plan_id for update;
  if v_stock is not null then
   update public.product_plans set stock=greatest(stock-v_count,0) where id=v_order.plan_id;
   insert into public.inventory_ledger(plan_id,quantity,movement_type,note,actor_id) values(v_order.plan_id,-v_count,'stock_out','Account credentials allocated to order '||v_order.order_number,auth.uid());
  end if;
 end if;
 update public.orders set status='fulfilled',fulfilled_at=now(),delivery_data=jsonb_build_object('mode','account_credentials','credentials',v_credentials) where id=p_order_id;
 insert into public.deliveries(order_id,mode,status,payload,delivered_at) values(p_order_id,'automatic','sent',jsonb_build_object('mode','account_credentials','credentials',v_credentials),now())
 on conflict(order_id) do update set mode='automatic',status='sent',payload=excluded.payload,delivered_at=excluded.delivered_at;
 return jsonb_build_object('credentials',v_credentials,'already_assigned',false);
end $function$;

