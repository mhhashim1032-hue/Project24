# Gold Feather deployment environment

This directory contains environment-variable documentation and safe templates only. Never commit real credentials, tokens, service-role keys, or populated `.env` files here.

## Vercel project settings

Set the Vercel project Root Directory to `telegram-commerce-hub`. Use the existing GitHub repository `mhhashim1032-hue/Project24` and deploy the `migration/vercel-production` branch as a Preview first.

Required Vercel variables (Production and Preview as appropriate):

- `NEXT_PUBLIC_SUPABASE_URL` — Supabase project URL; browser-visible.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase anon/publishable key; browser-visible and protected by RLS.
- `SUPABASE_URL` — Supabase project URL for server routes.
- `SUPABASE_SERVICE_ROLE_KEY` — server-only secret; never prefix with `NEXT_PUBLIC_`.
- `TELEGRAM_BOT_TOKEN` — server-only bot token.
- `TELEGRAM_WEBHOOK_SECRET` — Telegram webhook secret token; server-only.
- `APP_URL` — exact deployed Vercel URL, without trailing slash.
- `STORE_NAME` — display name used in Telegram welcome messages.

Optional legacy variable: `BINANCE_PAY_ID` is present in older Render configuration examples; verify whether it is used by the current deployed application before copying it.

## Supabase Edge Function secrets — do not migrate to Vercel

The `gold-feather-commerce` Edge Function runs inside Supabase and keeps its own secrets. These are not needed by the Next.js Vercel project unless a future code change explicitly introduces a server-side dependency:

- `SUPABASE_URL`
- `SUPABASE_SECRET_KEYS` or `SUPABASE_SERVICE_ROLE_KEY`
- `TELEGRAM_BOT_TOKEN`
- `BINANCE_API_KEY`
- `BINANCE_API_SECRET`
- `TELEGRAM_BOT_USERNAME`
- `NOTIFICATION_BOT_TOKEN`
- `TRONSCAN_API_KEY`

Do not rotate or overwrite these during the hosting migration. Keep them configured in Supabase Edge Function secrets.

## Safe migration order

1. Configure Vercel project and add server-side secrets using Vercel's encrypted environment-variable interface.
2. Deploy a Preview and test `/`, `/miniapp`, `/admin`, `/api/health`, and `/api/version`.
3. Verify Supabase authentication, Mini App bootstrap, order creation, wallet reads, and non-money test flows.
4. Only after tests pass, set `APP_URL` to the production Vercel URL and register the Telegram webhook using `/api/telegram/setup` with the setup secret.
5. Keep Render available for rollback until webhook and payment workflows are verified.

## Source of truth

Render's currently connected MCP interface can inspect service configuration but does not expose the service's secret environment-variable values. Therefore this folder deliberately contains a key inventory and safe placeholders, not copied secrets. Populate Vercel directly from the Render dashboard's reveal/copy controls or a securely authorized CLI/API export; never place secrets in GitHub commits or chat messages.
