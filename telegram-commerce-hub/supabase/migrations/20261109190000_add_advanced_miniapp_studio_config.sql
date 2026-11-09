ALTER TABLE public.bot_settings
  ADD COLUMN IF NOT EXISTS miniapp_config jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.bot_settings
  DROP CONSTRAINT IF EXISTS bot_settings_miniapp_config_object_check;

ALTER TABLE public.bot_settings
  ADD CONSTRAINT bot_settings_miniapp_config_object_check
  CHECK (jsonb_typeof(miniapp_config) = 'object');

COMMENT ON COLUMN public.bot_settings.miniapp_config IS
  'Admin-managed, customer-safe Mini App experience configuration. Never store secrets here.';
