-- Add the missing covering index for product_plan_credentials.product_id foreign key.
create index if not exists product_plan_credentials_product_id_idx
  on public.product_plan_credentials(product_id);
