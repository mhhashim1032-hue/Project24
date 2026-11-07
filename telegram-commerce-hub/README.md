# Gold Feather Premium — Commerce OS

Gold Feather Premium is a Telegram-first digital commerce platform with a private admin dashboard, customer Mini App, Binance Pay personal-account verification and automatic digital fulfilment.

## Production architecture

- Next.js 15 / React 19 app on Render (Singapore)
- Supabase PostgreSQL, RLS and private server-side RPCs
- Telegram Bot API webhook and Telegram Mini App
- Binance Pay personal-account transaction history API (read-only)
- Atomic payment claims, duplicate transaction protection and idempotent orders

## Live app

- Admin dashboard: https://nova-telegram-commerce.onrender.com/
- Telegram Mini App: https://nova-telegram-commerce.onrender.com/miniapp
- Health: https://nova-telegram-commerce.onrender.com/api/health

The custom domain can be connected later; update `APP_URL` when it is ready. Active Mini App server endpoints are Next.js API routes on Render; the Supabase Edge Function source folder is not deployed or required.

## Telegram setup

1. Create the bot using @BotFather.
2. Add `TELEGRAM_BOT_TOKEN` to the Render service environment.
3. The server calls Telegram `getMe` on startup and synchronizes the numeric Bot ID into Store identity automatically.
4. On server startup the app sets the bot display name to **Gold Feather Premium**, configures the webhook and installs the persistent **Open Store** Mini App menu button.
5. Send `/start` to the bot.

The Telegram Mini App verifies signed `initData` server-side: Ed25519 third-party signature when available, with Telegram's standard bot-token HMAC validation as a compatibility fallback. Both paths enforce a freshness window. The browser's `initDataUnsafe` is never trusted. A customer profile is automatically created from Telegram identity when the Mini App opens; customers add their Binance UID once in their profile.

Telegram usernames, display names, language and profile photos are only available when Telegram provides them. Telegram does not automatically provide the customer's email address or phone number.

## Binance Pay automatic verification

This implementation uses Binance's personal-account Pay Trade History endpoint:

- `GET https://api.binance.com/sapi/v1/pay/transactions`
- The endpoint is signed with HMAC-SHA256 and the API key is sent only from the server.
- The endpoint returns Pay transaction history; it is not a direct transaction-ID lookup. The service queries the narrow order time window and matches the submitted transaction ID.

### Configure credentials

In the Render service → Environment, add:

- `BINANCE_API_KEY`
- `BINANCE_API_SECRET`
- `TELEGRAM_BOT_TOKEN` is already the Render bot credential; do not store a duplicate in the browser or Supabase database.

Create a personal Binance API key with **Read-only / USER_DATA** permission only. Do not enable trading or withdrawals. Never put the API secret in GitHub, `NEXT_PUBLIC_` variables, browser code, Telegram messages or the admin form. The app's `INTERNAL_API_SECRET` and `PAYMENT_VERIFY_SECRET` are already provisioned server-side.

In the admin dashboard:
- Set the receiving **Binance Pay ID** under Bot & Store.
- Optionally set the numeric **Telegram Bot ID** (digits before the colon in the bot token) for Telegram's Ed25519 third-party signature validation. The server also supports standard HMAC validation using the Edge Function bot-token secret.
- Customers enter their own numeric Binance UID in the Mini App profile.

### Verification rules

The server accepts a payment only when the Binance Pay history record matches all of these. For asset-converted payments it checks both the transaction's headline amount/currency and the actual transferred assets in `fundsDetail`:
- Exact transaction ID
- Incoming receiver identity matching the configured store Binance Pay ID
- Payer Binance UID matching the customer's saved Binance UID
- Exact order amount and currency
- Supported Pay transfer type
- Successful transaction time inside the order's allowed time window

A submitted transaction ID is not accepted as proof by itself. If Binance has not indexed the transfer yet, the submission remains pending and the customer can use **Check transaction again** after the cooldown. Submitting the same transaction ID again is rejected.

### Duplicate and double-payment protection

- Case-insensitive unique index for submitted Binance transaction IDs.
- Globally unique verified transaction claims.
- One verified payment per order.
- One active unpaid order per Telegram customer.
- One pending Binance reference per order.
- Row-locked atomic payment RPC updates the payment, order and delivery record in one database transaction.
- Idempotency key protects order creation from repeat taps/network retries.
- Expired unpaid orders are cancelled before a new order is created.

Binance Pay transaction history has a high UID request weight. The active Next.js API routes only call the API when a customer submits a transaction or explicitly rechecks a pending submission, and enforce a 65-second account-wide request gate because the endpoint carries a high request weight. If the API returns the maximum 100 records in the search window, verification fails closed rather than accepting an incomplete match.

## Customer Mini App

- Single-open Telegram profile registration
- Customer profile and Binance UID linking
- Product catalogue and plans
- Unique order creation and exact payment instructions
- Transaction ID submission and automatic Binance verification
- Duplicate payment rejection
- Order history, payment status and digital delivery access

## Fulfilment

- **Automatic:** Admin stores a licence key, account details, download URL or delivery instructions in the admin-only `product_delivery_secrets` table. The delivery payload is released only after the verified-payment RPC succeeds.
- **Manual:** Admin can complete delivery for products without an automatic payload.
- Customers can view released delivery details in their own Mini App order history.

Never store sensitive credentials in public product descriptions or `products.delivery_payload`.

## Admin first-time setup

1. Open the admin dashboard and create an account.
2. Verify the email if Supabase email confirmation is enabled.
3. Promote the owner account to admin in Supabase SQL Editor:

```sql
update public.profiles p
set role = 'admin'
from auth.users u
where p.id = u.id
  and u.email = 'YOUR_ADMIN_EMAIL';
```

4. Sign out and sign in again.
5. Set Store name to **Gold Feather Premium**, enter the Telegram Bot ID, and configure the Binance Pay ID.
6. Add products, plans, prices and delivery details.

## Security model

- Telegram Mini App identity is verified server-side using Telegram's signed data.
- Telegram Mini App API routes use an internal server-only secret and private PostgreSQL RPCs; no service-role key is shipped to the browser.
- Telegram customer profiles and delivery payloads are protected by RLS.
- Customers can access only their own orders through the authenticated Telegram Mini App flow.
- Payment state transitions and duplicate claims are enforced in PostgreSQL.
- Binance credentials are stored only as server-side Render environment variables.
- Admin manual payment review remains available as a fallback when Binance API credentials are not configured or a transfer cannot be matched.

## Important operational notes

- The free Render instance may spin down when idle; the first request after inactivity can take longer.
- Binance API credentials and Telegram bot token have not yet been supplied in this environment. Live Telegram login and automatic payment verification cannot be fully tested until they are configured.
- Binance controls the legal/display name on the underlying personal account. The platform brands the store as **Gold Feather Premium**, but cannot rename the personal Binance account itself.
