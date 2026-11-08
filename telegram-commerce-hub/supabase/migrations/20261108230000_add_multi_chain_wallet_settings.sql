-- Add receiving-address configuration fields for the planned additional networks.
-- These are public deposit addresses, not private keys or API credentials.
-- Network verification must remain disabled until a verified backend adapter exists.
alter table public.bot_settings
  add column if not exists usdt_ton_wallet_address text,
  add column if not exists usdt_erc20_wallet_address text,
  add column if not exists usdt_sol_wallet_address text,
  add column if not exists usdc_bep20_wallet_address text;
