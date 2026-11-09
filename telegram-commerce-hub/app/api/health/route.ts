import { isServerSecretConfigured } from '@/lib/server-secrets';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

async function verifyServiceRole(supabaseUrl: string, serviceRoleKey: string) {
  if (!supabaseUrl || !serviceRoleKey) return false;
  try {
    const response = await fetch(
      supabaseUrl + '/rest/v1/profiles?select=id&limit=0',
      {
        headers: {
          apikey: serviceRoleKey,
          authorization: 'Bearer ' + serviceRoleKey,
        },
        cache: 'no-store',
        signal: AbortSignal.timeout(5000),
      },
    );
    return response.ok;
  } catch {
    return false;
  }
}

export async function GET() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const [telegramConfigured, serviceRoleVerified] = await Promise.all([
    isServerSecretConfigured('telegram_bot_token', 'TELEGRAM_BOT_TOKEN'),
    verifyServiceRole(supabaseUrl, serviceRoleKey),
  ]);

  const appUrl = Boolean(process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL);
  const webhookConfigured = Boolean(telegramConfigured && process.env.TELEGRAM_WEBHOOK_SECRET && appUrl);
  const anonKey = Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const databaseConfigured = Boolean(supabaseUrl && anonKey);
  const customerRegistrationConfigured = Boolean(supabaseUrl && serviceRoleVerified);
  const miniAppConfigured = Boolean(telegramConfigured && appUrl && databaseConfigured);
  const checks = {
    telegramConfigured,
    webhookConfigured,
    databaseConfigured,
    serviceRoleVerified,
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
