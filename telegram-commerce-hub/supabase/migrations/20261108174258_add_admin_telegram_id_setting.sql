alter table public.bot_settings
  add column if not exists admin_telegram_id text;
