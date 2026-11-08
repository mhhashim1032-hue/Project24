const URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export async function getServerSecret(name: 'telegram_bot_token' | 'binance_api_key' | 'binance_api_secret', fallbackEnv: string) {
  if (URL && SERVICE) {
    try {
      const response = await fetch(URL + '/rest/v1/rpc/admin_get_payment_secret', {
        method: 'POST',
        headers: { apikey: SERVICE, authorization: 'Bearer ' + SERVICE, 'content-type': 'application/json' },
        body: JSON.stringify({ p_name: name }),
        cache: 'no-store',
        signal: AbortSignal.timeout(5000),
      });
      if (response.ok) {
        const value = await response.json();
        if (typeof value === 'string' && value.length > 0) return value;
      }
    } catch (error) {
      console.warn('Vault secret lookup failed for', name);
    }
  }
  return process.env[fallbackEnv] || '';
}

export async function isServerSecretConfigured(name: 'telegram_bot_token' | 'binance_api_key' | 'binance_api_secret', fallbackEnv: string) {
  return Boolean(await getServerSecret(name, fallbackEnv));
}
