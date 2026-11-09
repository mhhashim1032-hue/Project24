const URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "https://ckresrujdienuqczzyki.supabase.co";
const ANON = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

export async function invokeGoldFeatherServer(
  action: string,
  payload: Record<string, unknown> = {},
  options: { authorization?: string; webhookSecret?: string; setupSecret?: string; timeoutMs?: number } = {},
) {
  if (!ANON) return { status: 503, data: { error: "SUPABASE_PUBLISHABLE_KEY_NOT_CONFIGURED" } };
  try {
    const headers: Record<string, string> = { apikey: ANON, "content-type": "application/json" };
    headers.authorization = options.authorization || "Bearer " + ANON;
    if (options.webhookSecret) headers["x-telegram-bot-api-secret-token"] = options.webhookSecret;
    if (options.setupSecret) headers["x-setup-secret"] = options.setupSecret;
    const response = await fetch(URL + "/functions/v1/gold-feather-server", {
      method: "POST", headers, body: JSON.stringify({ action, ...payload }), cache: "no-store",
      signal: AbortSignal.timeout(options.timeoutMs || 15000),
    });
    const data = await response.json().catch(() => ({ error: "INVALID_SERVER_RESPONSE" }));
    return { status: response.status, data };
  } catch {
    return { status: 503, data: { error: "SUPABASE_SERVER_FUNCTION_UNAVAILABLE" } };
  }
}
