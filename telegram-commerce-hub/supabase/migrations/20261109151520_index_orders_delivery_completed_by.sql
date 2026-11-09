create index if not exists orders_delivery_completed_by_idx
  on public.orders (delivery_completed_by);
