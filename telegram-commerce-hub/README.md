# Gold Feather Premium — Telegram Commerce OS

A Telegram commerce administration system with a private admin dashboard, bot webhook, Binance Pay ID transaction verification and automatic/manual fulfilment. The customer-facing Telegram Mini App has been retired; existing customer, product, order, payment and fulfilment data is retained.

## Infrastructure

- Next.js 15 / React 19 / TypeScript admin dashboard on Vercel
- SheetJS 0.20.3 from the official SheetJS CDN for spreadsheet import/export (avoids the stale, vulnerable npm-registry 0.18.5 package)
- Supabase PostgreSQL with Row Level Security, Vault-backed credentials and subscription records
- Supabase Edge Functions `gold-feather-commerce` (customer sessions, checkout and payment verification) and `gold-feather-server` (admin server operations, webhook, health and developer API)
- Telegram Bot API webhook for customer registration, referral attribution and support
- Binance personal-account Pay Trade History API (read-only USER_DATA permission)

## App URLs

- Admin dashboard: https://gold-feather-premium.vercel.app/admin
- Health: https://gold-feather-premium.vercel.app/api/health

The canonical Vercel hostname is `gold-feather-premium.vercel.app`; the product branding displayed to customers is **Gold Feather Premium**. Update `APP_URL` if the canonical domain changes.

## Telegram bot activation

1. Create the bot with **@BotFather**.
2. Sign in to the admin dashboard and open **Bot & Store → Encrypted bot & payment credentials**.
3. Paste the main Telegram bot token from BotFather and save it. The token is encrypted in Supabase Vault and is never returned to the browser.
4. Keep only `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `APP_URL` in the Vercel project. The server-role credential and Telegram/Binance secrets are read inside Supabase Edge Functions and Supabase Vault; do not copy them into Vercel or the browser.
5. In the admin dashboard, use **Bot & Store → Configure Telegram webhook** to register the webhook and remove any old Mini App menu button, then send `/start` to the bot.

The bot username (the `@username`) is controlled by BotFather and cannot be renamed through the Bot API. Save the correct username in the admin dashboard so referral links point to the right bot.

The Telegram webhook registers customers when they send `/start`, applies referral attribution where appropriate, and keeps the admin broadcast and support workflows available. The webhook secret is retained from the Supabase Edge Function environment when configured; otherwise it is deterministically derived from the Vault-held bot token during setup. The Next.js API routes proxy authenticated admin work to the Edge Function and do not require a Vercel service-role key.

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

### Binance credentials

Open **Admin → Bot & Store → Encrypted bot & payment credentials** and save the Binance API key and secret. The admin API stores them in Supabase Vault. The Edge Function reads Vault first and retains `BINANCE_API_KEY` / `BINANCE_API_SECRET` Edge Function secrets as a server-side fallback.

Create the personal Binance API key with **Enable Reading / USER_DATA only**. Do not enable trading, withdrawals or transfers. Use IP restrictions if your Binance account supports them. The credentials are never sent to the browser.

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
- Existing order, subscription, payment and delivery records remain in Supabase and can be reviewed by administrators.

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
- Supabase Edge Functions use the platform's server-side service-role credential; no service-role key is stored in Vercel or shipped to the browser.
- Customer profiles and payment claims are not directly readable by anonymous users.
- Privileged admin API operations are executed by the Supabase `gold-feather-server` Edge Function after validating the signed-in admin session; Vercel does not hold a service-role key.
- Telegram bot token and Binance API credentials are stored in Supabase Vault when configured through the admin dashboard; server-side environment secrets remain fallback options.
- Product delivery payloads are stored in an admin-only table.
- No Binance trading or withdrawal permission is required.

## Remaining activation steps

The database, admin dashboard, bot webhook and payment-verification logic remain in place. Configure the Telegram bot token in the admin Vault panel, set `APP_URL` in Vercel, and use **Configure Telegram webhook** in the admin dashboard to clear any old Mini App menu button. No Supabase service-role key or Telegram bot token is required in Vercel. Automatic Binance verification requires the read-only API key and secret saved in the admin Vault panel and the receiving Pay ID in the admin dashboard. The first admin account must also be created and promoted using the SQL above.
\n\n## Commerce extensions added\n\nA follow-up migration adds product warranty duration, per-plan quantity-discount configuration, an auditable stock adjustment ledger, wallet transaction ledger, refund requests and warranty claims. Admin stock adjustments and wallet credits are restricted to authenticated admins; warranty claims are accepted only for paid/fulfilled orders while the product warranty is active. The admin screens still need to be wired to all these workflows before they are administrator-ready.\n
