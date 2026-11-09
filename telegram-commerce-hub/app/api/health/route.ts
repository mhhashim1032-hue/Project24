import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

async function verifySecretVault(supabaseUrl: string, serviceRoleKey: string) {
  if (!supabaseUrl || !serviceRoleKey) return { serviceRoleVerified: false, vaultTokenConfigured: false };
  try {
    const response = await fetch(supabaseUrl + '/rest/v1/rpc/admin_get_payment_secret', {
      method: 'POST',
      headers: {
        apikey: serviceRoleKey,
        authorization: 'Bearer ' + serviceRoleKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ p_name: 'telegram_bot_token' }),
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return { serviceRoleVerified: false, vaultTokenConfigured: false };
    const secret = await response.json();
    return {
      serviceRoleVerified: true,
      vaultTokenConfigured: typeof secret === 'string' && secret.length > 0,
    };
  } catch {
    return { serviceRoleVerified: false, vaultTokenConfigured: false };
  }
}

export async function GET() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const anonKey = Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const appUrl = Boolean(process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL);
  const [vault, envTelegramToken] = await Promise.all([
    verifySecretVault(supabaseUrl, serviceRoleKey),
    Promise.resolve(Boolean(process.env.TELEGRAM_BOT_TOKEN)),
  ]);

  const telegramConfigured = vault.vaultTokenConfigured || envTelegramToken;
  const webhookConfigured = Boolean(telegramConfigured && process.env.TELEGRAM_WEBHOOK_SECRET && appUrl);
  const databaseConfigured = Boolean(supabaseUrl && anonKey);
  const customerRegistrationConfigured = Boolean(supabaseUrl && vault.serviceRoleVerified);
  const miniAppConfigured = Boolean(telegramConfigured && appUrl && databaseConfigured);
  const checks = {
    telegramConfigured,
    webhookConfigured,
    databaseConfigured,
    serviceRoleVerified: vault.serviceRoleVerified,
    secretVaultReachable: vault.serviceRoleVerified,
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
