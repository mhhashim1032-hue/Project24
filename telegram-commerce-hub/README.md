# NOVA Commerce OS — Telegram Software Store

A secure Next.js + Supabase control plane for selling software, licences and subscriptions through Telegram. Includes product/plan management, order tracking, Binance Pay ID reference submissions, manual payment review and fulfilment operations.

## Infrastructure
- Supabase project: `telegram-commerce-hub` (Singapore region)
- Database: PostgreSQL with RLS enabled
- Render: Docker web service (Singapore)
- Telegram: webhook integration (requires your bot token)

## Deploy on Render
Create a Docker Web Service from this repository using:
- Root directory / Docker context: `telegram-commerce-hub`
- Dockerfile: `telegram-commerce-hub/Dockerfile` (if the Render UI requires repo-root-relative path)
- Region: Singapore
- Health check: `/`
- Environment variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `APP_URL`

The service can build and serve the admin UI without a Telegram token. Add the token only after deployment. Never commit `.env` files.

## First admin setup
1. Create an account through the sign-in page's account creation link.
2. Verify the email if email confirmation is enabled.
3. In Supabase SQL Editor, run this once with your exact account email:

```sql
update public.profiles p set role = 'admin'
from auth.users u where p.id = u.id and u.email = 'YOUR_ADMIN_EMAIL';
```

4. Sign out and sign in again. Admin access is enforced by database RLS, not by hiding UI controls.

## Telegram setup
Set `TELEGRAM_BOT_TOKEN` in Render. `TELEGRAM_WEBHOOK_SECRET` is generated and stored in the Render environment; `APP_URL` is already configured. On server startup, the app registers its Telegram webhook automatically. If needed, the secure manual endpoint is `POST /api/telegram/setup` with header `x-setup-secret: <TELEGRAM_WEBHOOK_SECRET>`. The bot supports `/start`, `/catalog`, `/help` and `/orders`. Customers can browse products in Telegram, open the hosted store, register, place an order and submit their Binance transaction reference.

## Binance Pay ID safety
This release records customer-submitted transaction references and routes them to the admin payment-review queue. A reference ID is not independently verifiable proof of payment. Binance personal Pay ID transfers do not provide a general public transaction-verification API for arbitrary recipients. Do not automatically deliver a product from a submitted reference alone. Admins must verify the incoming transfer in their own Binance account before approving. Do not add Binance Merchant API credentials if you do not intend to use that product.

## Security notes
- Supabase RLS is enabled on all application tables.
- Public users can read active catalogue items only.
- Customers can read their own orders and submit payment references.
- Admin actions require `profiles.role = 'admin'`.
- The Supabase service-role key is never included in frontend code.
- Add rate limiting / CAPTCHA to public signup and checkout before a high-volume public launch.

## Current scope and limitations
The dashboard and schema are deployed separately from the Telegram bot credentials. Automatic fulfilment requires a secure inventory/delivery payload and a verified paid order; this project currently includes manual approval and tracking foundations. Do not advertise automatic payment verification until an authorized, independently verifiable transaction feed is configured and tested.
