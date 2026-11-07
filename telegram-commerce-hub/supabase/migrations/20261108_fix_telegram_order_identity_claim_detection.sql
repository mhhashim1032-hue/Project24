-- Keep the production order trigger compatible with PostgREST JWT claim formats.
-- The live project received this migration on 2026-11-08.
create or replace function public.validate_customer_order() returns trigger
language plpgsql set search_path=public as $$
declare
  p public.products%rowtype;
  pl public.product_plans%rowtype;
  request_role text;
  expected_amount numeric;
begin
  request_role := coalesce(auth.role(), current_setting('request.jwt.claim.role', true));
  if request_role = 'service_role' then
    if new.customer_id is not null or new.telegram_customer_id is null then
      raise exception 'Telegram order must be linked to a Telegram customer';
    end if;
    if not exists (select 1 from public.telegram_customers tc where tc.id=new.telegram_customer_id and tc.is_blocked=false) then
      raise exception 'Telegram customer unavailable';
    end if;
  else
    if auth.uid() is null or new.customer_id is distinct from auth.uid() then
      raise exception 'Customer identity mismatch';
    end if;
  end if;
  select * into p from public.products where id=new.product_id and is_active=true;
  select * into pl from public.product_plans where id=new.plan_id and product_id=new.product_id and is_active=true;
  if p.id is null or pl.id is null then raise exception 'Product or plan unavailable'; end if;
  expected_amount := public.calculate_plan_total(pl.id, coalesce(new.quantity,1));
  if new.amount <> expected_amount or new.currency <> pl.currency then
    raise exception 'Order amount does not match current plan price and quantity';
  end if;
  new.status := 'awaiting_payment';
  new.fulfillment_mode := p.fulfillment_mode;
  if request_role='service_role' then
    select telegram_user_id into new.telegram_user_id from public.telegram_customers where id=new.telegram_customer_id;
  else
    new.telegram_user_id := null;
  end if;
  new.paid_at := null;
  new.fulfilled_at := null;
  new.delivery_data := '{}'::jsonb;
  new.expires_at := now()+interval '30 minutes';
  new.payment_deadline_at := new.expires_at;
  return new;
end;
$$;
