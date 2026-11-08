# Gold Feather Premium environment templates

These files document the environment variables configured in the Vercel project. They are **templates**, not secret backups.

## Source of truth

The live values remain in Vercel → Project Settings → Environment Variables for project `gold-feather-premium`. Keep secret values in Vercel (or a password manager), never in Git.

## Files

- `production.env.example` — Production variable names and safe public configuration.
- `preview.env.example` — Preview variable names and safe public configuration.
- `development.env.example` — Development variable names and safe public configuration.

Replace every `REPLACE_WITH_...` placeholder only in a private local environment file. Never commit the completed file.

## Vercel inventory checked 2026-11-08

| Variable | Vercel targets | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Production, Preview, Development | Public Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Production, Preview, Development | Publishable/anon client key |
| `SUPABASE_URL` | Production, Preview, Development | Server-side Supabase URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Production, Preview, Development | **Secret**; server only |
| `TELEGRAM_BOT_TOKEN` | Production, Preview, Development | **Secret** |
| `TELEGRAM_WEBHOOK_SECRET` | Production, Preview, Development | **Secret** |
| `APP_URL` | Production, Development, Preview | Preview has an additional branch-scoped entry for `migration/vercel-production`; both point to the canonical production URL |
| `STORE_NAME` | Production, Preview, Development | Store display name |
| `VERCEL_PREVIEW_FEEDBACK_ENABLED` | Preview | Set to `0` to disable preview feedback toolbar |
| `TELEGRAM_SETUP_ONCE_KEY` | Production | Legacy one-time key; value was cleared after migration and is not an active app secret |

Vercel returned 18 variable records, including per-environment records and two Preview `APP_URL` entries. The templates consolidate identical keys into one entry per environment.

## Secret handling

- Do not put real bot tokens, webhook secrets, Supabase service-role keys, or one-time keys in GitHub.
- Keep `.env`, `.env.local`, and completed environment files out of commits.
- Only use `NEXT_PUBLIC_` for values that are intentionally exposed to the browser.
- The Supabase service-role key must only be used by trusted server-side code.
- The templates intentionally use placeholders for all credentials. They are not intended to overwrite Vercel values.
