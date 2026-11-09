ALTER TABLE public.bot_settings
  DROP CONSTRAINT IF EXISTS bot_settings_miniapp_theme_check;

UPDATE public.bot_settings
SET miniapp_theme = 'aurum',
    miniapp_layout = 'grid',
    miniapp_accent_color = '#c9a45c'
WHERE id = 1
  AND (miniapp_theme IS NULL OR miniapp_theme IN (
    'gold','midnight','ocean','rose','emerald',
    'graphite','lavender','crimson','arctic','cyber'
  ));

ALTER TABLE public.bot_settings
  ADD CONSTRAINT bot_settings_miniapp_theme_check
  CHECK (miniapp_theme = ANY (ARRAY[
    'aurum','eclipse','aurora','sakura','monolith',
    'verdant','glacier','solstice','neon-forge','porcelain'
  ]::text[]));

ALTER TABLE public.bot_settings
  ALTER COLUMN miniapp_theme SET DEFAULT 'aurum';
