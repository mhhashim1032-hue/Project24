import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-telegram-bot-api-secret-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: cors });
const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const secretKeysRaw = Deno.env.get("SUPABASE_SECRET_KEYS");
// These Vault RPCs explicitly require the legacy service_role JWT claim. Prefer the platform-injected legacy key while the database guards use that claim; the newer sb_secret key is not a JWT.
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || (secretKeysRaw ? JSON.parse(secretKeysRaw).default : "");
function createApiKeyFetch(apiKey: string): typeof fetch {
  return async (input, init) => {
    const requestHeaders = input instanceof Request ? input.headers : undefined;
    const headers = new Headers(init?.headers ?? requestHeaders);
    if (apiKey.startsWith("sb_") && headers.get("authorization") === `Bearer ${apiKey}`) {
      headers.delete("authorization");
    }
    return fetch(input, { ...init, headers });
  };
}
const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: createApiKeyFetch(serviceKey) } });
const QR_FIELDS = new Set(["binance_pay_qr_url", "usdt_tron_qr_url", "usdt_bep20_qr_url"]);
const MIME_EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
const BATCH_SIZE = 8;

const secretEnvironmentFallbacks: Record<string, string> = {
  telegram_bot_token: "TELEGRAM_BOT_TOKEN",
  binance_api_key: "BINANCE_API_KEY",
  binance_api_secret: "BINANCE_API_SECRET",
};
async function getSecret(name: string) {
  const { data, error } = await admin.rpc("admin_get_payment_secret", { p_name: name });
  if (!error && typeof data === "string" && data.length > 0) return data;
  const fallbackName = secretEnvironmentFallbacks[name];
  return fallbackName ? Deno.env.get(fallbackName) || "" : "";
}
async function setSecret(name: string, value: string) {
  const { error } = await admin.rpc("admin_set_payment_secret", { p_name: name, p_secret: value });
  if (error) throw new Error("SECRET_VAULT_WRITE_FAILED");
}
async function requireAdmin(req: Request) {
  const bearer = req.headers.get("authorization") || "";
  const match = bearer.match(/^Bearer\s+(.+)$/i);
  if (!match) return { ok: false as const, status: 401, error: "ADMIN_AUTH_REQUIRED" };
  const { data, error } = await admin.auth.getUser(match[1]);
  if (error || !data.user) return { ok: false as const, status: 401, error: "ADMIN_SESSION_INVALID" };
  const { data: profile, error: profileError } = await admin.from("profiles").select("role").eq("id", data.user.id).maybeSingle();
  if (profileError || profile?.role !== "admin") return { ok: false as const, status: 403, error: "ADMIN_ACCESS_REQUIRED" };
  return { ok: true as const, user: data.user };
}
async function telegram(token: string, method: string, payload: Record<string, unknown>) {
  const response = await fetch("https://api.telegram.org/bot" + token + "/" + method, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload),
    signal: AbortSignal.timeout(8000),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.ok) throw new Error(String(result.description || "TELEGRAM_" + method.toUpperCase() + "_FAILED"));
  return result.result;
}
async function webhookSecret(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token + ":gold-feather-webhook-v1"));
  return Array.from(new Uint8Array(digest)).map(x => x.toString(16).padStart(2, "0")).join("");
}
function b64ToBytes(value: string) {
  const clean = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(clean + "=".repeat((4 - clean.length % 4) % 4));
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}
async function health(appUrl: string) {
  const [settings, vaultProbe] = await Promise.all([
    admin.from("bot_settings").select("id").eq("id", 1).maybeSingle(),
    admin.rpc("admin_get_payment_secret", { p_name: "telegram_bot_token" }),
  ]);
  const telegramToken = typeof vaultProbe.data === "string" && vaultProbe.data.length > 0
    ? vaultProbe.data
    : Deno.env.get("TELEGRAM_BOT_TOKEN") || "";
  const [binanceKey, binanceSecret] = await Promise.all([
    getSecret("binance_api_key"),
    getSecret("binance_api_secret"),
  ]);
  const safeAppUrl = appUrl.replace(/\/$/, "");
  let webhookConfigured = false, menuButtonConfigured = false;
  if (telegramToken && /^https:\/\//i.test(safeAppUrl)) {
    try {
      const [webhook, menu] = await Promise.all([
        telegram(telegramToken, "getWebhookInfo", {}),
        telegram(telegramToken, "getChatMenuButton", {}),
      ]);
      webhookConfigured = String(webhook.url || "") === safeAppUrl + "/api/telegram/webhook";
      menuButtonConfigured = menu.type === "web_app" && String(menu.web_app?.url || "") === safeAppUrl + "/miniapp";
    } catch { webhookConfigured = false; menuButtonConfigured = false; }
  }
  const checks = {
    databaseConfigured: !settings.error && Boolean(settings.data),
    secretVaultReachable: !vaultProbe.error,
    serviceRoleVerified: !vaultProbe.error,
    telegramConfigured: Boolean(telegramToken),
    binanceConfigured: Boolean(binanceKey && binanceSecret),
    appUrlConfigured: /^https:\/\//i.test(safeAppUrl),
    webhookConfigured,
    menuButtonConfigured,
    customerRegistrationConfigured: !settings.error && !vaultProbe.error,
    miniAppConfigured: Boolean(telegramToken && /^https:\/\//i.test(safeAppUrl) && webhookConfigured && menuButtonConfigured),
  };
  const ok = checks.databaseConfigured && checks.secretVaultReachable && checks.serviceRoleVerified &&
    checks.telegramConfigured && checks.appUrlConfigured && checks.webhookConfigured && checks.menuButtonConfigured;
  return json({ ok, status: ok ? "ready" : "degraded", checks, functionVersion: 3 }, ok ? 200 : 503);
}
async function handleWebhook(req: Request, body: any) {
  const token = await getSecret("telegram_bot_token");
  if (!token) return json({ ok: false, error: "BOT_TOKEN_NOT_CONFIGURED" }, 503);
  const expected = await webhookSecret(token);
  const configuredValue = Deno.env.get("TELEGRAM_WEBHOOK_SECRET") || "";
  const configured = /^[A-Za-z0-9_-]{1,256}$/.test(configuredValue) ? configuredValue : expected;
  const supplied = req.headers.get("x-telegram-bot-api-secret-token");
  if (supplied !== configured && supplied !== expected) return json({ ok: false }, 401);
  const update = body.update || {};
  const message = update.message;
  if (!message?.chat?.id) return json({ ok: true });
  const chatId = message.chat.id;
  const input = String(message.text || "").trim();
  const user = message.from || {};
  const appUrl = String(body.appUrl || Deno.env.get("APP_URL") || "").replace(/\/$/, "");
  const keyboard = appUrl ? { inline_keyboard: [[{ text: "🛍 Open Store", web_app: { url: appUrl + "/miniapp" } }]] } : undefined;
  const send = (text: string, parseMode?: string) => telegram(token, "sendMessage", {
    chat_id: chatId, text, ...(parseMode ? { parse_mode: parseMode } : {}), ...(keyboard ? { reply_markup: keyboard } : {}),
  });
  if (input.startsWith("/start") || input.startsWith("/help")) {
    if (user.id) {
      const { data: existing } = await admin.from("telegram_customers").select("id").eq("telegram_user_id", String(user.id)).maybeSingle();
      const wasNew = !existing;
      const { data: customer, error } = await admin.from("telegram_customers").upsert({
        telegram_user_id: String(user.id), first_name: String(user.first_name || "Telegram user").slice(0, 128),
        last_name: user.last_name ? String(user.last_name).slice(0, 128) : null,
        username: user.username ? String(user.username).slice(0, 64) : null,
        language_code: user.language_code ? String(user.language_code).slice(0, 16) : null,
        is_premium: Boolean(user.is_premium), updated_at: new Date().toISOString(),
      }, { onConflict: "telegram_user_id" }).select("id").single();
      if (error || !customer) throw new Error("TELEGRAM_CUSTOMER_REGISTRATION_FAILED");
      const startPayload = input.split(/\s+/, 2)[1] || "";
      const referralCode = startPayload.startsWith("ref_") ? startPayload.slice(4).toLowerCase() : "";
      if (wasNew && referralCode) {
        const { error: referralError } = await admin.rpc("apply_referral_onboarding", { p_new_customer_id: customer.id, p_referral_code: referralCode });
        if (referralError) console.error("Referral attribution failed", referralError.message);
      }
    }
    const safeName = String(user.first_name || "there").replace(/[&<>"]/g, "");
    const storeName = String(body.storeName || Deno.env.get("STORE_NAME") || "GOLD FEATHER PREMIUM").replace(/[&<>"]/g, "");
    await send("<b>" + storeName + "</b>\nWelcome, " + safeName + "! Your Telegram account is ready. Open the store to browse products, place orders and manage purchases.", "HTML");
    return json({ ok: true, registered: Boolean(user.id) });
  }
  if (input.startsWith("/catalog") || input === "Browse catalogue") {
    await send("Browse products and plans in the store:");
    return json({ ok: true });
  }
  if (input.startsWith("/orders") || input === "My orders") {
    await send("Open the store to view your profile, payment status and digital deliveries:");
    return json({ ok: true });
  }
  await send("Use /start to register and open the store:");
  return json({ ok: true });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "");
    if (action === "health") return await health(String(body.appUrl || Deno.env.get("APP_URL") || ""));
    if (action === "telegram_webhook") return await handleWebhook(req, body);
    if (action === "developer_catalog") {
      const bearer = req.headers.get("authorization") || "";
      const match = bearer.match(/^Bearer (gf_live_[A-Za-z0-9_-]{40,})$/);
      if (!match) return json({ error: "API_KEY_REQUIRED", message: "Send your developer key in the Authorization: Bearer header." }, 401);
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(match[1]));
      const keyHash = Array.from(new Uint8Array(digest)).map(x => x.toString(16).padStart(2, "0")).join("");
      const { data: key } = await admin.from("telegram_developer_api_keys").select("id").eq("key_hash", keyHash).is("revoked_at", null).maybeSingle();
      if (!key) return json({ error: "INVALID_OR_REVOKED_API_KEY" }, 401);
      const { data: products, error: productsError } = await admin.from("products").select("id,slug,name,description,category,image_url,sort_order").eq("is_active", true).order("sort_order").limit(500);
      if (productsError) throw productsError;
      const ids = (products || []).map((x: any) => x.id);
      const { data: plans, error: plansError } = ids.length
        ? await admin.from("product_plans").select("id,product_id,name,description,price,currency,duration_days,stock,quantity_discount_tiers").eq("is_active", true).in("product_id", ids).order("price").limit(2000)
        : { data: [], error: null };
      if (plansError) throw plansError;
      await admin.from("telegram_developer_api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", key.id);
      const data = (products || []).map((product: any) => ({
        id: product.id, slug: product.slug, name: product.name, description: product.description,
        category: product.category, image_url: product.image_url,
        plans: (plans || []).filter((plan: any) => plan.product_id === product.id).map((plan: any) => ({
          id: plan.id, name: plan.name, description: plan.description, price: plan.price, currency: plan.currency,
          duration_days: plan.duration_days, stock: plan.stock, quantity_discount_tiers: plan.quantity_discount_tiers || [],
        })),
      }));
      return json({ ok: true, version: "2026-11-09", data, meta: { products: data.length, plans: (plans || []).length, read_only: true } });
    }

    const adminAuth = await requireAdmin(req);
    let setupAuthorized = false;
    if (!adminAuth.ok && action === "admin_telegram_setup") {
      const suppliedSetupSecret = req.headers.get("x-setup-secret") || "";
      if (suppliedSetupSecret) {
        const configuredSetupSecret = Deno.env.get("TELEGRAM_WEBHOOK_SECRET") || "";
        const botToken = await getSecret("telegram_bot_token");
        const derivedSetupSecret = botToken ? await webhookSecret(botToken) : "";
        setupAuthorized = suppliedSetupSecret === configuredSetupSecret || suppliedSetupSecret === derivedSetupSecret;
      }
    }
    if (!adminAuth.ok && !setupAuthorized) return json({ error: adminAuth.error }, adminAuth.status);

    if (action === "admin_get_payment_secrets") {
      const [apiKey, apiSecret, telegramToken] = await Promise.all([
        getSecret("binance_api_key"), getSecret("binance_api_secret"), getSecret("telegram_bot_token"),
      ]);
      return json({ configured: Boolean(apiKey && apiSecret), apiKeyConfigured: Boolean(apiKey), apiSecretConfigured: Boolean(apiSecret), telegramBotTokenConfigured: Boolean(telegramToken) });
    }
    if (action === "admin_set_payment_secrets") {
      const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
      const apiSecret = typeof body.apiSecret === "string" ? body.apiSecret.trim() : "";
      const telegramBotToken = typeof body.telegramBotToken === "string" ? body.telegramBotToken.trim() : "";
      if (!apiKey && !apiSecret && !telegramBotToken) return json({ error: "Enter at least one credential to save." }, 400);
      if ((apiKey && apiKey.length < 8) || (apiSecret && apiSecret.length < 8) || (telegramBotToken && !/^[0-9]{5,15}:[A-Za-z0-9_-]{20,}$/.test(telegramBotToken))) return json({ error: "Credential value is invalid." }, 400);
      if (apiKey) await setSecret("binance_api_key", apiKey);
      if (apiSecret) await setSecret("binance_api_secret", apiSecret);
      if (telegramBotToken) await setSecret("telegram_bot_token", telegramBotToken);
      const [keySaved, secretSaved, botSaved] = await Promise.all([getSecret("binance_api_key"), getSecret("binance_api_secret"), getSecret("telegram_bot_token")]);
      return json({ ok: true, configured: Boolean(keySaved && secretSaved), apiKeyConfigured: Boolean(keySaved), apiSecretConfigured: Boolean(secretSaved), telegramBotTokenConfigured: Boolean(botSaved), message: "Credentials saved encrypted in Supabase Vault. Secret values are never returned." });
    }
    if (action === "admin_upload_payment_qr") {
      const key = String(body.key || "");
      const mime = String(body.mimeType || "");
      const extension = MIME_EXT[mime];
      if (!QR_FIELDS.has(key)) return json({ error: "Unknown payment QR field." }, 400);
      if (!extension || typeof body.base64 !== "string") return json({ error: "Use a PNG, JPG, or WebP image." }, 400);
      const bytes = b64ToBytes(body.base64);
      if (!bytes.length || bytes.length > 4 * 1024 * 1024) return json({ error: "QR image must be larger than 0 bytes and no more than 4 MB." }, 400);
      const path = "payment-qr/" + key + "-" + Date.now() + "." + extension;
      const { error: uploadError } = await admin.storage.from("product-images").upload(path, bytes, { contentType: mime, cacheControl: "3600", upsert: true });
      if (uploadError) throw new Error("PAYMENT_QR_STORAGE_UPLOAD_FAILED");
      const publicUrl = admin.storage.from("product-images").getPublicUrl(path).data.publicUrl;
      const { data: saved, error: saveError } = await admin.from("bot_settings").update({ [key]: publicUrl }).eq("id", 1).select("id").single();
      if (saveError || !saved?.id) throw new Error("PAYMENT_QR_SETTINGS_SAVE_FAILED");
      return json({ ok: true, key, url: publicUrl, message: "QR image uploaded and saved successfully." });
    }
    if (action === "admin_broadcast") {
      const message = String(body.message || "").trim();
      const offset = Number(body.offset ?? 0);
      if (!message || message.length > 3900) return json({ error: "Enter a message between 1 and 3900 characters." }, 400);
      if (!Number.isSafeInteger(offset) || offset < 0) return json({ error: "Invalid broadcast offset." }, 400);
      const token = await getSecret("telegram_bot_token");
      if (!token) return json({ error: "Telegram bot token is not configured." }, 503);
      const { data: customers, error } = await admin.from("telegram_customers").select("telegram_user_id").eq("is_blocked", false).order("created_at", { ascending: true }).order("telegram_user_id", { ascending: true }).range(offset, offset + BATCH_SIZE - 1);
      if (error) throw error;
      let sent = 0, failed = 0;
      const recipients = customers || [];
      for (let index = 0; index < recipients.length; index += 4) {
        const batch = recipients.slice(index, index + 4);
        const results = await Promise.all(batch.map(async (customer: any) => {
          try { await telegram(token, "sendMessage", { chat_id: customer.telegram_user_id, text: message, disable_web_page_preview: false }); return true; }
          catch { return false; }
        }));
        sent += results.filter(Boolean).length;
        failed += results.length - results.filter(Boolean).length;
      }
      return json({ ok: true, sent, failed, nextOffset: offset + (customers || []).length, done: (customers || []).length < BATCH_SIZE });
    }
    if (action === "admin_telegram_setup") {
      const appUrl = String(body.appUrl || "").replace(/\/$/, "");
      if (!/^https:\/\//i.test(appUrl)) return json({ error: "A valid HTTPS app URL is required." }, 400);
      const token = await getSecret("telegram_bot_token");
      if (!token) return json({ error: "Telegram bot token is not configured." }, 503);
      const configuredSecret = Deno.env.get("TELEGRAM_WEBHOOK_SECRET") || "";
      const secret = /^[A-Za-z0-9_-]{1,256}$/.test(configuredSecret) ? configuredSecret : await webhookSecret(token);
      const webhookUrl = appUrl + "/api/telegram/webhook";
      const miniAppUrl = appUrl + "/miniapp";
      await telegram(token, "setMyName", { name: "Gold Feather Premium", language_code: "en" });
      await telegram(token, "setMyDescription", { description: "Gold Feather Premium — premium digital products, software and subscriptions with secure checkout." });
      await telegram(token, "setMyShortDescription", { short_description: "Shop premium digital products and subscriptions." });
      await telegram(token, "setMyCommands", { commands: [
        { command: "start", description: "Open Gold Feather Premium" },
        { command: "catalog", description: "Browse software and subscriptions" },
        { command: "orders", description: "View your orders" },
        { command: "help", description: "Get store help" },
      ] });
      await telegram(token, "setWebhook", { url: webhookUrl, secret_token: secret, allowed_updates: ["message", "callback_query"], drop_pending_updates: false });
      await telegram(token, "setChatMenuButton", { menu_button: { type: "web_app", text: "Open Store", web_app: { url: miniAppUrl } } });
      const [webhookInfo, menuButton, bot] = await Promise.all([
        telegram(token, "getWebhookInfo", {}), telegram(token, "getChatMenuButton", {}), telegram(token, "getMe", {}),
      ]);
      const settingsSynced = Boolean((await admin.from("bot_settings").update({ telegram_bot_id: String(bot.id), ...(bot.username ? { telegram_bot_username: String(bot.username) } : {}) }).eq("id", 1)).error === null);
      const ok = String(webhookInfo.url || "") === webhookUrl && menuButton.type === "web_app" && String(menuButton.web_app?.url || "") === miniAppUrl && settingsSynced;
      return json({ ok, settingsSynced, webhookInfo, menuButton, bot: { id: bot.id, username: bot.username }, verification: { webhook: String(webhookInfo.url || "") === webhookUrl, menuButton: menuButton.type === "web_app" && String(menuButton.web_app?.url || "") === miniAppUrl, pendingUpdateCount: Number(webhookInfo.pending_update_count || 0), lastWebhookError: webhookInfo.last_error_message || null } }, ok ? 200 : 502);
    }
    return json({ error: "UNKNOWN_ACTION" }, 400);
  } catch (error) {
    console.error("Gold Feather server function failed:", error instanceof Error ? error.message : "UNKNOWN");
    const message = error instanceof Error ? error.message : "SERVER_FUNCTION_FAILED";
    return json({ error: message }, 500);
  }
});
