# Gold Feather Premium — Telegram Commerce OS

A premium software and subscription store with a Telegram bot, Telegram Mini App, private admin dashboard, Binance Pay ID transaction verification and automatic/manual fulfilment.

## Infrastructure

- Next.js 15 / React 19 / TypeScript admin dashboard on Render (Singapore)
- Supabase PostgreSQL with Row Level Security and subscription records
- Supabase Edge Function `gold-feather-commerce` for signed Telegram Mini App sessions, customer operations and payment verification
- Telegram Bot API webhook and Mini App
- Binance personal-account Pay Trade History API (read-only USER_DATA permission)

## App URLs

- Admin dashboard: https://nova-telegram-commerce.onrender.com
- Telegram Mini App: https://nova-telegram-commerce.onrender.com/miniapp
- Health: https://nova-telegram-commerce.onrender.com/api/health

The Render service hostname is still the technical `nova-telegram-commerce` hostname; the product branding displayed to customers is **Gold Feather Premium**. A custom domain can be connected later by updating `APP_URL`.

## Telegram bot activation

1. Create the bot with **@BotFather**.
2. Add `TELEGRAM_BOT_TOKEN` to the Render service environment.
3. The application automatically calls Telegram's Bot API to set the display name, description, commands, webhook and Mini App menu button.
4. On startup, it also synchronizes the numeric bot ID into Supabase so the Edge Function can validate Telegram's signed Mini App launch data.
5. Send `/start` to the bot and open the Mini App.

The display name is set to **Gold Feather Premium**. The bot username (the `@username`) is controlled by BotFather and cannot be renamed through the Bot API.

The Mini App authenticates Telegram users using signed `initData`: Telegram's Ed25519 verification is preferred, with standard Bot-token HMAC validation as a compatibility fallback. It does not trust the browser's `initDataUnsafe`. Customer registration is automatic when the Mini App opens.

Telegram shares the fields available in the Telegram profile: Telegram ID, first/last name, username, language, optional profile photo and premium status. Telegram does not automatically share email or phone number.

## Binance Pay ID verification

The Supabase Edge Function queries Binance's personal-account Pay Trade History endpoint:

- `GET /sapi/v1/pay/transactions`

The integration is not Binance Merchant API. It accepts C2C Binance Pay ID transfers only and matches:

- The transaction ID submitted by the customer
- The receiving Pay ID configured in **Admin → Bot & Store**; customers do not provide a Binance UID
- Exact amount and currency
- Successful incoming transfer type and order time window

Customers are never asked for a Binance UID. They submit only the Binance transaction ID; the server checks that exact transaction against the store's incoming account history, configured receiving Pay ID, exact amount/currency, successful transfer status, supported transaction type and order time window.

### Binance credentials to add later

In the Supabase Dashboard, open **Edge Functions → Secrets** and add:

- `BINANCE_API_KEY`
- `BINANCE_API_SECRET`
- `TELEGRAM_BOT_TOKEN` (same token used by Render; enables HMAC fallback on Telegram clients that do not provide the Ed25519 signature)

Create the personal Binance API key with **Enable Reading / USER_DATA only**. Do not enable trading, withdrawals or transfers. Use IP restrictions if your Binance account supports them. These secrets are available only to the Edge Function; they are never sent to the Mini App or browser.

Until both Binance credentials are configured, transaction references can be saved but automatic verification remains unavailable. Admins can manually approve or reject a submission after checking the receiving Binance account; all manual approvals are audited and transaction IDs are globally claimed. No product is delivered without either a successful automatic match or an explicit admin approval.

## Duplicate-payment and order protection

- Transaction references are unique across Binance submissions, case-insensitively.
- A transaction ID cannot be reused by another customer or order, including after a rejected submission.
- One active unpaid order is allowed per Telegram customer.
- Order creation is idempotent and serializes on the customer record.
- Only one pending payment reference is allowed per order.
- Only one verified payment is allowed per order.
- Verification claims the Binance transaction ID in a database table with a unique constraint.
- Verification checks payer UID, receiver Pay ID, C2C transfer type, amount, currency and transaction time.
- Orders and payment rows are locked during state transitions; repeated callbacks cannot deliver twice.
- Binance history requests are rate-limited to avoid excessive API weight.

## Subscriptions and fulfilment

- Subscription purchases create a subscription record after verified payment.
- Renewals extend from the current active expiry date.
- Expired unpaid orders are cancelled and reserved stock is restored.
- **Automatic fulfilment:** admins save licence keys, download links or delivery instructions in the admin-only `product_delivery_secrets` table. Delivery is released only after payment verification.
- **Manual fulfilment:** admins can complete paid orders from the dashboard.
- Customers can see their order status, subscription expiry and released delivery in the Mini App.

Never put licence keys, account credentials or other secrets in public product descriptions.

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
5. Add products, subscription plans, prices and fulfilment mode.
6. In **Bot & Store**, set the receiving Binance Pay ID, payment instructions and support username.
7. For automatic delivery, add the product's private delivery payload.

## Security

- Supabase RLS is enabled; security advisor reports no security lints.
- Telegram Mini App requests are signed and validated server-side.
- The Edge Function uses Supabase's server-side service role; no service-role key is shipped to the browser.
- Customer profiles and payment claims are not directly readable by anonymous users.
- Internal Render-to-Supabase bot-ID synchronization uses a server-only secret.
- Binance API credentials stay in Supabase Edge Function Secrets.
- Product delivery payloads are stored in an admin-only table.
- No Binance trading or withdrawal permission is required.

## Remaining activation steps

The infrastructure, database, dashboard, Mini App, bot webhook, Edge Function and verification logic are deployed. Live Telegram registration requires `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `APP_URL`, `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in Render. Automatic Binance verification requires `BINANCE_API_KEY` and `BINANCE_API_SECRET` in Supabase Edge Function Secrets and the receiving Pay ID in the admin dashboard. The first admin account must also be created and promoted using the SQL above.
\n\n## Commerce extensions added\n\nA follow-up migration adds product warranty duration, per-plan quantity-discount configuration, an auditable stock adjustment ledger, wallet transaction ledger, refund requests and warranty claims. Admin stock adjustments and wallet credits are restricted to authenticated admins; warranty claims are accepted only for paid/fulfilled orders while the product warranty is active. The admin and Mini App screens still need to be wired to all these workflows before they are customer-ready.\n

## Render deployment target

The production Render web service `nova-telegram-commerce` must deploy this project from the `main` branch using `telegram-commerce-hub` as its Docker build context and `telegram-commerce-hub/Dockerfile` as its Dockerfile. After every source update, verify that the live Render deploy commit matches the GitHub `main` commit before treating the change as production-ready. The `/api/health` endpoint confirms process health only; it does not replace checkout and Mini App smoke tests.
