ALTER TABLE public.bot_settings ALTER COLUMN miniapp_theme SET DEFAULT 'aurum';
UPDATE public.bot_settings
SET miniapp_theme = 'aurum',
    miniapp_layout = 'grid',
    miniapp_accent_color = '#c9a45c'
WHERE id = 1
  AND (miniapp_theme IS NULL OR miniapp_theme IN ('gold','midnight','ocean','rose','emerald','graphite','lavender','crimson','arctic','cyber'));
