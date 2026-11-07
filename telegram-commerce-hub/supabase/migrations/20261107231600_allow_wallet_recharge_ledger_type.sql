-- Add a dedicated ledger transaction type for verified customer wallet top-ups.
alter table public.wallet_transactions drop constraint if exists wallet_transactions_transaction_type_check;
alter table public.wallet_transactions add constraint wallet_transactions_transaction_type_check
check (transaction_type = any (array['admin_credit','purchase','refund','adjustment','wallet_recharge']::text[]));
