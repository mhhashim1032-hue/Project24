# Gold Feather Premium — Telegram Commerce OS

Premium digital product and subscription commerce, operated through a Telegram bot, Telegram Mini App, and a private admin dashboard.

## Production architecture

- **Web app:** Next.js 15, React 19, TypeScript
- **Database and access control:** Supabase PostgreSQL, Row Level Security, RPCs
- **Hosting:** Render web service, Singapore region
- **Telegram:** Bot API webhook + Telegram Mini App
- **Payments:** Binance Pay ID transfers, verified against the owner's personal Binance Pay transaction history using a read-only API key
- **Fulfilment:** Automatic digital delivery after successful verification, or manual admin fulfilment

## Live service

- Render app: https://nova-telegram-commerce.onrender.com
- Admin dashboard: https://nova-telegram-commerce.onrender.com
- Telegram Mini App: https://nova-telegram-commerce.onrender.com/miniapp
- Health: https://nova-telegram-commerce.onrender.com/api/health

## Telegram setup — one bot token

1. Create the bot with **@BotFather**.
2. Add only `TELEGRAM_BOT_TOKEN` to the Render service environment.
3. The app automatically configures the bot's display name, description, commands, webhook and Mini App menu button on startup.
4. Open the bot and send `/start`.

The display name is set to **Gold Feather Premium**. Telegram bot usernames are managed by BotFather and cannot be renamed through the Bot API.

The Mini App validates Telegram's signed `initData` on the server. The browser's `initDataUnsafe` is never trusted. Customer registration is automatic when a customer opens the Mini App; Telegram profile data is stored in the protected `telegram_customers` table.

Telegram supplies the profile fields it makes available (Telegram ID, first/last name, username, language, premium status and optional profile photo). It does not automatically disclose a customer's email address or phone number.

## Binance Pay ID automatic verification

This integration uses the personal-account Binance Pay Trade History endpoint:

- `GET /sapi/v1/pay/transactions`
- `GET /api/v3/account` to identify the receiving account UID

The Pay Trade History API returns transaction IDs, transaction time, amount, currency, transaction type, and payer/receiver details. C2C transfer records expose the receiver's Binance UID. The verifier requires an incoming (positive amount) C2C transfer whose transaction ID, receiving UID, amount, currency and time window match the customer's pending order.

Binance documentation:
- https://developers.binance.com/en/docs/catalog/investment-and-services-pay/api/rest-api/
- https://developers.binance.com/en/docs/products/spot/rest-api

### Credentials to add later in Render

Add these as private environment variables (never in GitHub, frontend code, or the dashboard):

- `BINANCE_API_KEY`
- `BINANCE_API_SECRET`

Create the API key with **read-only / USER_DATA access only**. Do not enable trading or withdrawals. Restrict the key to the Render egress IP if your Binance account/API configuration supports it. The app derives the account UID from the authenticated account endpoint; no separate UID variable is required.

Until both Binance credentials are configured, the Mini App records submissions but does not mark them paid or deliver products. It fails closed.

### Duplicate and double-payment protection

- A transaction reference is unique across Binance submissions, case-insensitively.
- The same transaction ID cannot be submitted against another order.
- Each order is locked while a transaction is submitted, preventing concurrent submissions.
- Only one verified payment is allowed per order.
- Verification locks the payment and order rows and is idempotent.
- Outgoing transfers, wrong receiver UID, wrong currency, wrong amount, wrong transfer type, and out-of-window transactions are rejected.
- A rejected reference cannot be reused; the customer may submit a different transaction ID for the still-unpaid order.

## Fulfilment

- **Automatic:** Admin stores a licence key, account details, download URL or delivery instructions in the admin-only `product_delivery_secrets` table. The payload is released only after the payment verification RPC succeeds.
- **Manual:** Admin fulfils an order from the dashboard after payment is verified.
- Customers can view their order status and released digital delivery from the Mini App.

Never store sensitive credentials in public product descriptions or the public `products.delivery_payload` field.

## Admin first-time setup

1. Open the admin dashboard and create an account.
2. Verify the email if Supabase email confirmation is enabled.
3. Promote the owner account to admin in the Supabase SQL Editor:

```sql
update public.profiles p
set role = 'admin'
from auth.users u
where p.id = u.id
  and u.email = 'YOUR_ADMIN_EMAIL';
```

4. Sign out and sign in again.
5. Add products, plans, prices and fulfilment details.
6. Configure your Binance Pay ID and customer-facing payment instructions under **Bot & Store**.

## Security model

- Supabase RLS is enabled for application tables.
- Telegram Mini App init data is validated with the bot token and an expiry check.
- Internal Telegram RPCs require a server-only secret header; the secret is not sent to the browser.
- Telegram customer profiles are not directly readable by anonymous clients.
- Digital delivery payloads are stored in an admin-only table.
- Binance credentials are stored only in Render environment variables.
- No trading or withdrawal API permissions are needed.
- Duplicate transaction references and repeat order verification are blocked at database level.

## Important operational notes

- The free Render instance may spin down when idle; first request after inactivity can take longer.
- Binance Pay transaction history has a high request weight. The app performs a targeted history lookup only when a customer submits or retries a transaction; do not poll continuously.
- The automatic verifier relies on Binance returning the transaction in the account's Pay Trade History. If Binance has not indexed it yet, the order remains pending and can be checked again.
- The API credentials have not yet been supplied, and the Telegram bot token has not yet been added. Therefore live Telegram login and automatic Binance verification cannot be fully exercised until those credentials are configured.
