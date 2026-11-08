import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 15;

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

async function requireAdmin(req: NextRequest) {
  if (!URL || !ANON || !SERVICE) throw new Error('SECRET_VAULT_SERVER_NOT_CONFIGURED');
  const bearer = req.headers.get('authorization') || '';
  if (!bearer.startsWith('Bearer ')) throw new Error('ADMIN_AUTH_REQUIRED');
  const auth = await fetch(URL + '/auth/v1/user', {
    headers: { apikey: ANON, authorization: bearer }, cache: 'no-store',
  });
  if (!auth.ok) throw new Error('ADMIN_SESSION_INVALID');
  const user = await auth.json();
  const profileResponse = await fetch(
    URL + '/rest/v1/profiles?select=role&id=eq.' + encodeURIComponent(user.id) + '&limit=1',
    { headers: { apikey: SERVICE, authorization: 'Bearer ' + SERVICE }, cache: 'no-store' },
  );
  const profiles = await profileResponse.json();
  if (!profileResponse.ok || profiles?.[0]?.role !== 'admin') throw new Error('ADMIN_ACCESS_REQUIRED');
}

async function setSecret(name: string, value: string) {
  const response = await fetch(URL + '/rest/v1/rpc/admin_set_payment_secret', {
    method: 'POST',
    headers: { apikey: SERVICE, authorization: 'Bearer ' + SERVICE, 'content-type': 'application/json' },
    body: JSON.stringify({ p_name: name, p_secret: value }),
    cache: 'no-store',
  });
  if (!response.ok) {
    const detail = await response.text();
    console.error('Vault secret write failed:', response.status, detail.slice(0, 300));
    throw new Error('Could not save encrypted credential to Supabase Vault.');
  }
}

async function isConfigured(name: string) {
  const response = await fetch(URL + '/rest/v1/rpc/admin_get_payment_secret', {
    method: 'POST',
    headers: { apikey: SERVICE, authorization: 'Bearer ' + SERVICE, 'content-type': 'application/json' },
    body: JSON.stringify({ p_name: name }),
    cache: 'no-store',
  });
  if (!response.ok) return false;
  const value = await response.json();
  return typeof value === 'string' && value.length > 0;
}

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    const [apiKey, apiSecret, telegramBotToken] = await Promise.all([
      isConfigured('binance_api_key'), isConfigured('binance_api_secret'), isConfigured('telegram_bot_token'),
    ]);
    return NextResponse.json({ configured: apiKey && apiSecret, apiKeyConfigured: apiKey, apiSecretConfigured: apiSecret, telegramBotTokenConfigured: telegramBotToken });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'SECRET_VAULT_ERROR';
    const status = message.includes('AUTH') || message.includes('SESSION') ? 401 : message.includes('ACCESS') ? 403 : 503;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin(req);
    const body = await req.json();
    const apiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : '';
    const apiSecret = typeof body.apiSecret === 'string' ? body.apiSecret.trim() : '';
    const telegramBotToken = typeof body.telegramBotToken === 'string' ? body.telegramBotToken.trim() : '';
    if (!apiKey && !apiSecret && !telegramBotToken) return NextResponse.json({ error: 'Enter at least one credential to save.' }, { status: 400 });
    if ((apiKey && apiKey.length < 8) || (apiSecret && apiSecret.length < 8) || (telegramBotToken && !/^\\d{5,15}:[A-Za-z0-9_-]{20,}$/.test(telegramBotToken))) {
      return NextResponse.json({ error: 'Credential value is too short.' }, { status: 400 });
    }
    if (apiKey) await setSecret('binance_api_key', apiKey);
    if (apiSecret) await setSecret('binance_api_secret', apiSecret);
    if (telegramBotToken) await setSecret('telegram_bot_token', telegramBotToken);
    const [keySaved, secretSaved, botTokenSaved] = await Promise.all([
      isConfigured('binance_api_key'), isConfigured('binance_api_secret'), isConfigured('telegram_bot_token'),
    ]);
    return NextResponse.json({
      ok: true, configured: keySaved && secretSaved,
      apiKeyConfigured: keySaved, apiSecretConfigured: secretSaved, telegramBotTokenConfigured: botTokenSaved,
      message: 'Credential saved encrypted in Supabase Vault. The secret is never returned to the browser.',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'SECRET_VAULT_ERROR';
    const status = message.includes('AUTH') || message.includes('SESSION') ? 401 : message.includes('ACCESS') ? 403 : 503;
    console.error('Payment secret configuration failed:', message);
    return NextResponse.json({ error: message }, { status });
  }
}
