import { isServerSecretConfigured } from '@/lib/server-secrets';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const telegramConfigured = await isServerSecretConfigured('telegram_bot_token', 'TELEGRAM_BOT_TOKEN');
  const appUrl = Boolean(process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL);
  const webhookConfigured = Boolean(telegramConfigured && process.env.TELEGRAM_WEBHOOK_SECRET && appUrl);
  const supabaseUrl = Boolean(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL);
  const anonKey = Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const serviceRole = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  const databaseConfigured = Boolean(supabaseUrl && anonKey);
  const customerRegistrationConfigured = Boolean(supabaseUrl && serviceRole);
  const miniAppConfigured = Boolean(telegramConfigured && appUrl && databaseConfigured);
  const checks = {
    telegramConfigured,
    webhookConfigured,
    databaseConfigured,
    customerRegistrationConfigured,
    miniAppConfigured,
  };
  const ok = Object.values(checks).every(Boolean);

  return NextResponse.json({
    ok,
    status: ok ? 'ready' : 'degraded',
    service: 'gold-feather-premium-commerce-os',
    timestamp: new Date().toISOString(),
    checks,
    binanceConfigured: null,
    binanceSecretsLocation: 'supabase_vault_or_edge_function_secrets',
    telegramTokenLocation: 'supabase_vault_or_vercel_environment',
    binanceHealthCheck: 'Provider connectivity is checked during payment verification.',
  }, { status: ok ? 200 : 503, headers: { 'Cache-Control': 'no-store' } });
}
