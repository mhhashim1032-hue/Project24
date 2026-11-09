-- Replace every previous storefront theme with exactly two supported premium identities.
ALTER TABLE public.bot_settings DROP CONSTRAINT IF EXISTS bot_settings_miniapp_theme_check;
UPDATE public.bot_settings SET miniapp_theme=CASE WHEN miniapp_theme='obsidian' THEN 'obsidian' ELSE 'light-gold' END, miniapp_layout='grid', miniapp_accent_color=CASE WHEN miniapp_theme='obsidian' THEN '#d5d7da' ELSE '#80602f' END WHERE id=1;
ALTER TABLE public.bot_settings ADD CONSTRAINT bot_settings_miniapp_theme_check CHECK (miniapp_theme = ANY (ARRAY['light-gold','obsidian']::text[]));
ALTER TABLE public.bot_settings ALTER COLUMN miniapp_theme SET DEFAULT 'light-gold';
