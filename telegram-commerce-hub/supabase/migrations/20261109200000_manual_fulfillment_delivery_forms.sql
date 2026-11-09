-- Product-specific customer intake and verified-payment fulfillment routing.
alter table public.products
  add column if not exists delivery_form_schema jsonb not null default '[]'::jsonb;
alter table public.products
  add column if not exists delivery_instructions text not null default '';
alter table public.products
  add constraint products_delivery_form_schema_array
  check (jsonb_typeof(delivery_form_schema) = 'array');
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
alter table public.orders
  add constraint orders_delivery_form_schema_array
  check (jsonb_typeof(delivery_form_schema) = 'array');
alter table public.orders
  add constraint orders_delivery_form_data_object
  check (jsonb_typeof(delivery_form_data) = 'object');

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
      update public.product_plans
      set stock=case when stock is null then null else greatest(stock-assigned_count,0) end
      where id=o.plan_id and stock is not null;
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
