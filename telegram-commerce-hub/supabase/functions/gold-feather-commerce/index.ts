import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-telegram-init-data",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: cors });
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const secretKeysRaw = Deno.env.get("SUPABASE_SECRET_KEYS");
const serviceKey = secretKeysRaw ? JSON.parse(secretKeysRaw).default : Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const admin = createClient(supabaseUrl, serviceKey!, { auth: { persistSession: false, autoRefreshToken: false } });

function fromHex(hex: string) { return new Uint8Array(hex.match(/.{1,2}/g)!.map(x => parseInt(x, 16))); }
function fromBase64Url(value: string) {
  const base = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base + "=".repeat((4 - base.length % 4) % 4);
  return Uint8Array.from(atob(padded), c => c.charCodeAt(0));
}
async function verifyTelegramInitData(raw: string, botId: string) {
  const params = new URLSearchParams(raw);
  const signature = params.get("signature");
  const hash = params.get("hash");
  const authDate = Number(params.get("auth_date") || 0);
  if (!authDate || !hash || !/^[0-9a-f]{64}$/i.test(hash)) throw new Error("TELEGRAM_SIGNATURE_MISSING");
  const now = Math.floor(Date.now() / 1000);
  if (authDate > now + 60 || now - authDate > 3600) throw new Error("TELEGRAM_SESSION_EXPIRED");
  const hmacPairs: string[] = [];
  const signaturePairs: string[] = [];
  for (const [key, value] of params.entries()) {
    if (key !== "hash") hmacPairs.push([key, value].join("="));
    if (key !== "hash" && key !== "signature") signaturePairs.push([key, value].join("="));
  }
  hmacPairs.sort((a, b) => a.localeCompare(b));
  signaturePairs.sort((a, b) => a.localeCompare(b));
  const hmacCheckString = hmacPairs.join("\n");
  const signatureCheckString = signaturePairs.join("\n");
  let valid = false;
  if (signature && botId) {
    try {
      const checkString = `${botId}:WebAppData\n${signatureCheckString}`;
      const publicKey = await crypto.subtle.importKey(
        "raw", fromHex("e7bf03a2fa4602af4580703d88dda5bb59f32ed8b02a56c187fe7d34caed242d"),
        { name: "Ed25519" }, false, ["verify"]
      );
      valid = await crypto.subtle.verify({ name: "Ed25519" }, publicKey, fromBase64Url(signature), new TextEncoder().encode(checkString));
    } catch { valid = false; }
  }
  if (!valid) {
    const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
    if (!botToken) throw new Error("TELEGRAM_BOT_TOKEN_NOT_CONFIGURED");
    const encoder = new TextEncoder();
    const secretKey = await crypto.subtle.importKey("raw", encoder.encode("WebAppData"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const secret = await crypto.subtle.sign("HMAC", secretKey, encoder.encode(botToken));
    const hmacKey = await crypto.subtle.importKey("raw", secret, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const expected = new Uint8Array(await crypto.subtle.sign("HMAC", hmacKey, encoder.encode(hmacCheckString)));
    const supplied = fromHex(hash);
    let diff = expected.length ^ supplied.length;
    for (let i = 0; i < Math.min(expected.length, supplied.length); i++) diff |= expected[i] ^ supplied[i];
    valid = diff === 0;
  }
  if (!valid) throw new Error("TELEGRAM_SIGNATURE_INVALID");
  const userRaw = params.get("user");
  if (!userRaw) throw new Error("TELEGRAM_USER_MISSING");
  const user = JSON.parse(userRaw);
  if (!user?.id || !Number.isSafeInteger(Number(user.id))) throw new Error("TELEGRAM_USER_INVALID");
  return user;
}
function decimalToUnits(value: unknown): bigint | null {
  const s=String(value ?? "").trim();
  if(!/^\d+(\.\d+)?$/.test(s)) return null;
  const [whole,frac=""]=s.split(".");
  return BigInt(whole)*100000000n+BigInt((frac+"00000000").slice(0,8));
}
function fundsDetailMatches(tx: any, expectedAmount: unknown, expectedCurrency: string) {
  const target=decimalToUnits(expectedAmount);
  if(target===null||!Array.isArray(tx.fundsDetail))return false;
  const total=tx.fundsDetail.filter((f:any)=>String(f.currency||"").toUpperCase()===expectedCurrency.toUpperCase())
    .reduce((sum:bigint,f:any)=>sum+(decimalToUnits(f.amount)??0n),0n);
  return total===target;
}
function rawTokenUnitsToDecimal(raw: unknown, decimals: unknown): string {
  const value=String(raw??''); const d=Number(decimals);
  if(!/^[0-9]+$/.test(value)||!Number.isInteger(d)||d<0||d>18)return '';
  const units=BigInt(value), base=10n**BigInt(d), whole=units/base, fraction=(units%base).toString().padStart(d,'0').replace(/0+$/,'');
  return fraction ? whole.toString()+'.'+fraction : whole.toString();
}
function decimalEqual(a: unknown, b: unknown) {
  const norm = (v: unknown) => {
    const s = String(v ?? "").trim();
    if (!/^\d+(\.\d+)?$/.test(s)) return "";
    const [whole, frac = ""] = s.split(".");
    return whole.replace(/^0+(?=\d)/, "") + (frac.replace(/0+$/, "") ? "." + frac.replace(/0+$/, "") : "");
  };
  return norm(a) !== "" && norm(a) === norm(b);
}
function hex(buffer: ArrayBuffer) { return [...new Uint8Array(buffer)].map(x => x.toString(16).padStart(2, "0")).join(""); }
async function binancePayHistory(startTime: number, endTime: number) {
  const apiKey = Deno.env.get("BINANCE_API_KEY");
  const apiSecret = Deno.env.get("BINANCE_API_SECRET");
  if (!apiKey || !apiSecret) throw new Error("BINANCE_API_NOT_CONFIGURED");
  const params = new URLSearchParams();
  params.set("startTime", String(startTime));
  params.set("endTime", String(endTime));
  params.set("limit", "100");
  params.set("recvWindow", "5000");
  params.set("timestamp", String(Date.now()));
  const query = params.toString();
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(apiSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(query)));
  const response = await fetch(`https://api.binance.com/sapi/v1/pay/transactions?${query}&signature=${signature}`, {
    method: "GET",
    headers: { "X-MBX-APIKEY": apiKey, "Accept": "application/json" },
    signal: AbortSignal.timeout(12000),
  });
  const result = await response.json();
  if (!response.ok || result?.success !== true || result?.code !== "000000") {
    const err = new Error("BINANCE_API_ERROR");
    (err as any).detail = { status: response.status, code: result?.code, message: result?.msg || result?.message };
    throw err;
  }
  return Array.isArray(result.data) ? result.data : [];
}
async function notifyCommerceEvent(settings: any, message: string) {
  const token = Deno.env.get("NOTIFICATION_BOT_TOKEN"); const chatId = String(settings.notification_chat_id || "").trim();
  if (!token || !chatId) return;
  try { await fetch("https://api.telegram.org/bot"+token+"/sendMessage",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({chat_id:chatId,text:message,disable_web_page_preview:true}),signal:AbortSignal.timeout(8000)}); } catch (err) { console.error("Notification bot delivery failed",err); }
}
async function telegramChannelJoined(customer: any, settings: any) {
  const channelId=String(settings.required_channel_id||"").trim(); if(!channelId)return true;
  const token=Deno.env.get("TELEGRAM_BOT_TOKEN"); if(!token)return false;
  try { const r=await fetch("https://api.telegram.org/bot"+token+"/getChatMember",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({chat_id:channelId,user_id:Number(customer.telegram_user_id)}),signal:AbortSignal.timeout(8000)}); const d=await r.json(); const s=d?.result?.status; return Boolean(d?.ok&&(["creator","administrator","member"].includes(s)||(s==="restricted"&&d.result?.is_member===true))); } catch { return false; }
}
async function verifyTronPayment(order: any, customer: any, submission: any, settings: any) {
  const hash = String(submission.transaction_reference || '').trim();
  const response = await fetch('https://apilist.tronscanapi.com/api/transaction-info?hash=' + encodeURIComponent(hash), {
    headers: { 'Accept': 'application/json', ...(Deno.env.get('TRONSCAN_API_KEY') ? { 'TRON-PRO-API-KEY': Deno.env.get('TRONSCAN_API_KEY')! } : {}) },
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error('TRONSCAN_UNAVAILABLE');
  const tx = await response.json();
  if (!tx || tx.hash !== hash) return { state: 'pending', message: 'Transaction not indexed yet. Check again shortly.' };
  if (tx.confirmed !== true || tx.contractRet !== 'SUCCESS') return { state: 'pending', message: 'The transfer is not yet confirmed successfully on TRON. Check again after network confirmation.' };
  const transfer = tx.tokenTransferInfo || {}; const token = transfer.tokenInfo || tx.contractData?.tokenInfo || {};
  const contract = String(transfer.contract_address || token.tokenId || token.address || tx.contractData?.contract_address || '');
  const receiver = String(transfer.to_address || tx.contractData?.to_address || '');
  const sender = String(transfer.from_address || tx.contractData?.owner_address || '');
  const amount = rawTokenUnitsToDecimal(transfer.amount_str, transfer.decimals); const timestamp = Number(tx.timestamp || 0);
  const configured = String(settings.usdt_wallet_address || '').trim();
  const valid = contract === 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t' && String(transfer.symbol || token.tokenAbbr || token.token_abbr || '').toUpperCase() === 'USDT' && Number(transfer.decimals) === 6 && String(transfer.type || '').toLowerCase() === 'transfer' && Number(transfer.status) === 0 && tx.revert !== true && receiver.toLowerCase() === configured.toLowerCase() && decimalEqual(amount, order.amount) && timestamp >= new Date(order.created_at).getTime()-120000 && timestamp <= new Date(order.expires_at).getTime()+120000;
  if (!valid) { await admin.from('payment_submissions').update({ status:'rejected',verification_source:'onchain_explorer',verification_payload:tx,review_note:'On-chain transfer rejected: token contract, recipient, exact amount or payment time did not match.',last_verification_at:new Date().toISOString(),verification_attempts:(submission.verification_attempts||0)+1 }).eq('id',submission.id); return { state:'rejected',message:'This transaction does not match the required USDT token, receiving address, exact amount or 30-minute order window.' }; }
  const { data, error } = await admin.rpc('record_verified_onchain_payment',{p_order_id:order.id,p_customer_id:customer.id,p_submission_id:submission.id,p_tx_hash:hash,p_network:'TRON',p_amount:String(amount),p_token_contract:contract,p_sender:sender,p_receiver:receiver,p_block_time:new Date(timestamp).toISOString(),p_raw:tx});
  if (error) { if (error.code==='23505'||error.message?.includes('duplicate key')) return {state:'duplicate',message:'This transaction hash has already been used.'}; if(error.message?.includes('ORDER_NOT_PAYABLE')) return {state:'rejected',message:'The order has expired or is no longer payable.'}; throw error; }
  await notifyCommerceEvent(settings,'USDT order paid\nCustomer: '+customer.first_name+' (@'+(customer.username||'no username')+')\nOrder: '+order.order_number+'\nAmount: '+order.amount+' USDT\nNetwork: TRON TRC20\nTX: '+hash);
  return {state:data.status,message:'USDT transfer confirmed on TRON. Payment verified successfully.',order:data};
}
async function checkPayment(order: any, customer: any, submission: any, settings: any) {
  const now = Date.now();
  const { data: slot, error: gateError } = await admin.rpc('reserve_binance_pay_history_slot');
  if (gateError) throw gateError;
  if (slot !== true) {
    await admin.from('payment_submissions').update({ last_verification_at: new Date().toISOString(), review_note: 'Binance account-wide request cooldown is active. Use Check again after about 60 seconds.' }).eq('id', submission.id);
    return { state: 'pending', message: 'Verification is queued to protect your Binance API rate limit. Check again in about one minute.' };
  }
  const start = new Date(order.created_at).getTime() - 120000;
  const rows = await binancePayHistory(start, now);
  if (rows.length >= 100) {
    await admin.from("payment_submissions").update({ last_verification_at: new Date().toISOString(), verification_attempts: (submission.verification_attempts || 0) + 1, review_note: "Binance returned the maximum 100 records for this time window. Verification is paused to avoid an incomplete match; contact support." }).eq("id", submission.id);
    return { state: "pending", message: "Too many transactions in the search window. Verification is paused safely; contact support." };
  }
  const tx = rows.find((x: any) => String(x.transactionId || "").toUpperCase() === String(submission.transaction_reference).toUpperCase());
  if (!tx) {
    await admin.from("payment_submissions").update({ last_verification_at: new Date().toISOString(), verification_attempts: (submission.verification_attempts || 0) + 1, review_note: "Transaction ID not visible in Binance Pay history yet. Use Check again after a short wait." }).eq("id", submission.id);
    return { state: "pending", message: "Transaction not visible yet. Wait briefly and use Check again. Do not submit the same ID again." };
  }
  const receiver = tx.receiverInfo || {};
  const payer = tx.payerInfo || {};
  const configuredPayId = String(settings.binance_pay_id || "").trim();
  if (!configuredPayId || !customer.binance_id) return { state: "rejected", message: "Store Binance Pay ID or your Binance UID is missing from the profile." };
  const receiverIds = [receiver.accountId, receiver.binanceId, receiver.email, receiver.phoneNumber].filter(Boolean).map((v: any) => String(v).trim().toLowerCase());
  const receiverMatches = configuredPayId && receiverIds.includes(configuredPayId.toLowerCase());
  const payerMatches = String(payer.binanceId || "") === String(customer.binance_id || "");
  const time = Number(tx.transactionTime || 0);
  const timeMatches = time >= new Date(order.created_at).getTime() - 120000 && time <= new Date(order.expires_at).getTime() + 120000;
  const typeMatches = String(tx.orderType || "").toUpperCase() === "C2C" && String(payer.type || "").toUpperCase() === "USER" && String(receiver.type || "").toUpperCase() === "USER";
  const currency = String(order.currency || "").toUpperCase();
  const directValueMatches = decimalEqual(tx.amount, order.amount) && String(tx.currency || "").toUpperCase() === currency;
  const fundsValueMatches = fundsDetailMatches(tx, order.amount, currency);
  const amountCurrencyMatches = directValueMatches || fundsValueMatches;
  const transactionSucceeded = tx.success !== false;
  if (!receiverMatches || !payerMatches || !timeMatches || !typeMatches || !amountCurrencyMatches || !transactionSucceeded) {
    const reasons = [
      !receiverMatches && "recipient mismatch",
      !payerMatches && "payer Binance UID mismatch",
      !timeMatches && "transaction time outside order window",
      !typeMatches && "unsupported transaction type",
      !amountCurrencyMatches && "amount/currency mismatch",
      !transactionSucceeded && "transaction not successful",
    ].filter(Boolean).join(", ");
    await admin.from("payment_submissions").update({ status: "rejected", last_verification_at: new Date().toISOString(), verification_attempts: (submission.verification_attempts || 0) + 1, verification_source: "binance_pay_api", verification_payload: { transactionId: tx.transactionId, orderType: tx.orderType, amount: tx.amount, currency: tx.currency }, review_note: `Automatic verification rejected: ${reasons}.` }).eq("id", submission.id);
    return { state: "rejected", message: `Payment verification rejected: ${reasons}.` };
  }
  const { data: result, error } = await admin.rpc("record_verified_binance_payment", {
    p_order_id: order.id,
    p_telegram_customer_id: customer.id,
    p_payment_submission_id: submission.id,
    p_transaction_id: String(tx.transactionId),
    p_amount: String(tx.amount),
    p_currency: String(tx.currency),
    p_payer_binance_id: String(payer.binanceId || ""),
    p_receiver_pay_id: configuredPayId,
    p_transaction_time: new Date(time).toISOString(),
    p_raw_transaction: tx,
  });
  if (error) {
    if (error.message?.includes("duplicate key") || error.code === "23505") return { state: "duplicate", message: "This Binance transaction ID has already been used." };
    if (error.message?.includes("ORDER_NOT_PAYABLE")) return { state: "rejected", message: "This order is no longer payable." };
    throw error;
  }
  await notifyCommerceEvent(settings,'Binance Pay order paid\nCustomer: '+customer.first_name+' (@'+(customer.username||'no username')+')\nOrder: '+order.order_number+'\nAmount: '+order.amount+' '+order.currency+'\nTransaction: '+String(tx.transactionId));
  return { state: result.status, message: result.status === "fulfilled" ? "Payment verified. Your digital delivery is ready." : "Payment verified successfully. Your order is now paid.", order: result };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);
  try {
    const rawInitData = req.headers.get("x-telegram-init-data") || "";
    if (!rawInitData) return json({ error: "TELEGRAM_INIT_DATA_REQUIRED" }, 401);
    const { data: settings, error: settingsError } = await admin.from("bot_settings").select("*").eq("id", 1).single();
    if (settingsError || !settings) return json({ error: "STORE_SETTINGS_NOT_CONFIGURED" }, 503);
    const tg = await verifyTelegramInitData(rawInitData, String(settings.telegram_bot_id || ""));
    const { data: customer, error: customerError } = await admin.from("telegram_customers").upsert({
      telegram_user_id: String(tg.id),
      first_name: String(tg.first_name || "Telegram user").slice(0, 128),
      last_name: tg.last_name ? String(tg.last_name).slice(0, 128) : null,
      username: tg.username ? String(tg.username).slice(0, 64) : null,
      photo_url: tg.photo_url ? String(tg.photo_url).slice(0, 2048) : null,
      language_code: tg.language_code ? String(tg.language_code).slice(0, 16) : null,
      is_premium: Boolean(tg.is_premium),
      allows_write_to_pm: Boolean(tg.allows_write_to_pm),
      added_to_attachment_menu: Boolean(tg.added_to_attachment_menu),
      updated_at: new Date().toISOString(),
    }, { onConflict: "telegram_user_id" }).select("*").single();
    if (customerError || !customer) return json({ error: "PROFILE_CREATE_FAILED" }, 500);
    if (customer.is_blocked) return json({ error: "ACCOUNT_BLOCKED" }, 403);

    const body = await req.json();
    const action = String(body.action || "");
    const { error: expiryError } = await admin.rpc("expire_telegram_orders");
    if (expiryError) console.error("Expired order cleanup failed", expiryError);
    const needsChannel = ["create_order","pay_with_wallet","verify_usdt_onchain","refresh_onchain_payment","verify_payment","refresh_payment"].includes(action);
    const channelJoined = await telegramChannelJoined(customer,settings);
    if (needsChannel && !channelJoined) return json({error:"CHANNEL_JOIN_REQUIRED",message:"Join our Telegram channel before purchasing.",joinUrl:settings.required_channel_url||null},403);
    if (action === "wallet_balance") {
      const { data: rows, error } = await admin.from("wallet_transactions").select("amount,currency,direction").eq("telegram_customer_id", customer.id);
      if (error) return json({ error: "WALLET_READ_FAILED" }, 500);
      const balances: Record<string, number> = {};
      for (const row of rows || []) balances[row.currency] = (balances[row.currency] || 0) + (row.direction === "credit" ? 1 : -1) * Number(row.amount);
      return json({ ok: true, balances });
    }
    if (action === "request_refund") {
      const orderId = String(body.orderId || "");
      const reason = String(body.reason || "").trim().slice(0, 2000);
      if (!orderId || reason.length < 5) return json({ error: "REFUND_DETAILS_REQUIRED" }, 400);
      const { data: order } = await admin.from("orders").select("id,amount,currency,status").eq("id", orderId).eq("telegram_customer_id", customer.id).maybeSingle();
      if (!order || !["paid","fulfilled"].includes(order.status)) return json({ error: "REFUND_ORDER_NOT_ELIGIBLE" }, 409);
      const { data: prior } = await admin.from("refund_requests").select("id").eq("order_id", orderId).maybeSingle();
      if (prior) return json({ error: "REFUND_ALREADY_REQUESTED" }, 409);
      const { data, error } = await admin.from("refund_requests").insert({ order_id: order.id, telegram_customer_id: customer.id, amount: order.amount, currency: order.currency, reason }).select("id,status").single();
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true, refund: data });
    }
    if (action === "submit_warranty_claim") {
      const orderId = String(body.orderId || "");
      const reason = String(body.reason || "").trim().slice(0, 2000);
      if (!orderId || reason.length < 5) return json({ error: "WARRANTY_DETAILS_REQUIRED" }, 400);
      const { data: claimId, error } = await admin.rpc("submit_warranty_claim", {
        p_order_id: orderId, p_customer_id: customer.id, p_reason: reason,
        p_evidence_url: body.evidenceUrl ? String(body.evidenceUrl).slice(0, 2048) : null
      });
      if (error) return json({ error: error.message || "WARRANTY_CLAIM_FAILED" }, 400);
      return json({ ok: true, claimId });
    }
    if (action === "bootstrap") {
      const [products, orders] = await Promise.all([
        admin.from("products").select("id,name,description,category,image_url,product_plans(id,name,description,price,currency,duration_days,stock,is_active,quantity_discount_tiers)").eq("is_active", true).eq("product_plans.is_active", true).order("sort_order"),
        admin.from("orders").select("id,order_number,amount,currency,status,created_at,expires_at,subscription_expires_at,delivery_data,product_id,paid_at,products(name,warranty_days)").eq("telegram_customer_id", customer.id).order("created_at", { ascending: false }).limit(50),
      ]);
      return json({ ok: true, profile: customer, channelJoined: await telegramChannelJoined(customer,settings), settings: { store_name: settings.store_name, welcome_message: settings.welcome_message, payment_instructions: settings.payment_instructions, binance_pay_id: settings.binance_pay_id, currency: settings.currency, usdt_network: settings.usdt_network||'TRON', usdt_wallet_address: settings.usdt_wallet_address, support_url: settings.support_url, required_channel_url: settings.required_channel_url, tempsms_url: settings.tempsms_url||'https://tempsmslive.com', miniapp_theme: settings.miniapp_theme||'gold', miniapp_layout: settings.miniapp_layout||'grid', miniapp_accent_color: settings.miniapp_accent_color||'#9a7837' }, products: products.data || [], orders: orders.data || [] });
    }
    if (action === "save_binance_id") {
      const binanceId = String(body.binanceId || "").trim();
      if (!/^\d{5,20}$/.test(binanceId)) return json({ error: "Enter a valid numeric Binance UID." }, 400);
      const { data: customerOrders } = await admin.from("orders").select("id").eq("telegram_customer_id", customer.id).limit(1);
      if (customer.binance_id && customer.binance_id !== binanceId && (customerOrders || []).length > 0) return json({ error: "BINANCE_UID_LOCKED", message: "Your Binance UID is locked after your first order. Contact support to change it." }, 409);
      const { data, error } = await admin.from("telegram_customers").update({ binance_id: binanceId, updated_at: new Date().toISOString() }).eq("id", customer.id).select("*").single();
      if (error) return json({ error: "PROFILE_UPDATE_FAILED" }, 500);
      return json({ ok: true, profile: data });
    }
    if (action === "create_order") {
      const planId = String(body.planId || "");
      const idempotencyKey = String(body.idempotencyKey || "");
      if (!/^[0-9a-f-]{36}$/i.test(idempotencyKey)) return json({ error: "INVALID_IDEMPOTENCY_KEY" }, 400);
      const { data: order, error } = await admin.rpc("create_telegram_order_quantity_service", {
        p_telegram_customer_id: customer.id,
        p_plan_id: planId,
        p_idempotency_key: idempotencyKey,
        p_quantity: Math.max(1, Math.min(1000, Number(body.quantity || 1))),
      });
      if (error) return json({ error: error.message || "ORDER_CREATE_FAILED" }, 400);
      if (body.paymentMethod) await admin.from('orders').update({payment_method:String(body.paymentMethod)}).eq('id',order.id);
      return json({ ok: true, order: {...order,payment_deadline_at:order.payment_deadline_at||order.expires_at}, reusedOpenOrder: Boolean(order?.reusedOpenOrder) });
    }
    if (action === 'pay_with_wallet') {
      const orderId=String(body.orderId||''); if(!orderId)return json({error:'ORDER_ID_REQUIRED'},400);
      const {data,error}=await admin.rpc('pay_telegram_order_from_wallet',{p_order_id:orderId,p_customer_id:customer.id});
      if(error)return json({error:error.message||'WALLET_PAYMENT_FAILED'},400); await notifyCommerceEvent(settings,'Wallet order paid\nCustomer: '+customer.first_name+' (@'+(customer.username||'no username')+')\nOrder: '+(data.order_number||orderId)); return json({ok:true,...data});
    }
    if (action === 'verify_usdt_onchain') {
      const orderId=String(body.orderId||''); const txHash=String(body.transactionHash||'').trim().toLowerCase();
      if(!orderId||!/^[0-9a-f]{64}$/.test(txHash))return json({error:'INVALID_TRON_TRANSACTION_HASH'},400);
      if(String(settings.usdt_network||'TRON').toUpperCase()!=='TRON')return json({error:'UNSUPPORTED_USDT_NETWORK'},400);
      if(!settings.usdt_wallet_address)return json({error:'STORE_USDT_ADDRESS_NOT_CONFIGURED'},503);
      const {data:order}=await admin.from('orders').select('*').eq('id',orderId).eq('telegram_customer_id',customer.id).maybeSingle();
      if(!order||order.status!=='awaiting_payment'||new Date(order.expires_at).getTime()<=Date.now())return json({error:'ORDER_NOT_PAYABLE_OR_EXPIRED'},409);
      if(String(order.currency).toUpperCase()!=='USDT')return json({error:'ONCHAIN_REQUIRES_USDT_ORDER'},400);
      const {data:prior}=await admin.from('payment_submissions').select('id').ilike('transaction_reference',txHash).maybeSingle(); if(prior)return json({error:'DUPLICATE_TRANSACTION',message:'This transaction hash has already been submitted.'},409);
      const {data:submission,error}=await admin.from('payment_submissions').insert({order_id:order.id,telegram_customer_id:customer.id,provider:'usdt_tron',transaction_reference:txHash,amount:order.amount,currency:'USDT',status:'submitted',verification_source:'tronscan',verification_payload:{},chain_network:'TRON',chain_token_contract:'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',last_verification_at:new Date().toISOString()}).select('*').single();
      if(error)return json({error:error.code==='23505'?'DUPLICATE_TRANSACTION':error.message},409);
      try { const result=await verifyTronPayment(order,customer,submission,settings); return json({ok:true,submissionId:submission.id,...result}); }
      catch { await admin.from('payment_submissions').update({review_note:'TRON explorer temporarily unavailable. Retry verification.',last_verification_at:new Date().toISOString()}).eq('id',submission.id); return json({ok:true,state:'pending',submissionId:submission.id,message:'Explorer is temporarily unavailable. Your hash is saved; check again shortly.'}); }
    }
    if (action === 'refresh_onchain_payment') {
      const submissionId=String(body.submissionId||''); const {data:submission}=await admin.from('payment_submissions').select('*').eq('id',submissionId).eq('telegram_customer_id',customer.id).eq('provider','usdt_tron').maybeSingle();
      if(!submission)return json({error:'SUBMISSION_NOT_FOUND'},404); if(submission.status==='verified')return json({ok:true,state:'verified',message:'USDT transfer already verified.'});
      if(submission.status==='rejected')return json({error:'PAYMENT_REJECTED',message:submission.review_note},409);
      if(submission.last_verification_at&&Date.now()-new Date(submission.last_verification_at).getTime()<15000)return json({ok:true,state:'pending',message:'Wait a few seconds before checking again.'},429);
      const {data:order}=await admin.from('orders').select('*').eq('id',submission.order_id).eq('telegram_customer_id',customer.id).maybeSingle();
      if(!order||order.status!=='awaiting_payment'||new Date(order.expires_at).getTime()<=Date.now())return json({error:'ORDER_NOT_PAYABLE_OR_EXPIRED'},409);
      const result=await verifyTronPayment(order,customer,submission,settings); return json({ok:true,submissionId,...result});
    }
    if (action === "verify_payment") {
      const orderId = String(body.orderId || "");
      const transactionId = String(body.transactionId || "").trim().toUpperCase();
      if (!orderId || transactionId.length < 5 || transactionId.length > 128) return json({ error: "INVALID_PAYMENT_REFERENCE" }, 400);
      const { data: order } = await admin.from("orders").select("*").eq("id", orderId).eq("telegram_customer_id", customer.id).maybeSingle();
      if (!order || order.status !== "awaiting_payment") return json({ error: "ORDER_NOT_PAYABLE" }, 409);
      if (new Date(order.expires_at).getTime() < Date.now() - 120000) return json({ error: "ORDER_EXPIRED" }, 409);
      const { data: prior } = await admin.from("payment_submissions").select("id,provider").ilike("transaction_reference", transactionId).maybeSingle();
      if (prior) return json({ error: "DUPLICATE_TRANSACTION", message: "This transaction ID has already been used and cannot be reused. Submit a different transaction ID." }, 409);
      const { data: pending } = await admin.from("payment_submissions").select("id").eq("order_id", order.id).eq("provider", "binance_pay_api").eq("status", "submitted").maybeSingle();
      if (pending) return json({ error: "PAYMENT_ALREADY_PENDING", message: "This order already has a payment reference awaiting verification." }, 409);
      const { data: submission, error } = await admin.from("payment_submissions").insert({
        order_id: order.id, customer_id: null, telegram_customer_id: customer.id,
        provider: "binance_pay_api", transaction_reference: transactionId, currency: order.currency,
        status: "submitted", verification_source: "binance_pay_api", verification_payload: {},
        last_verification_at: new Date().toISOString(), verification_attempts: 0,
      }).select("*").single();
      if (error) {
        if (error.code === "23505") return json({ error: "DUPLICATE_TRANSACTION", message: "This transaction ID has already been submitted." }, 409);
        return json({ error: error.message }, 400);
      }
      try {
        const result = await checkPayment(order, customer, submission, settings);
        return json({ ok: true, submissionId: submission.id, ...result });
      } catch (e) {
        await admin.from("payment_submissions").update({ review_note: "Binance API temporarily unavailable. Use Check again later.", last_verification_at: new Date().toISOString() }).eq("id", submission.id);
        return json({ ok: true, state: "pending", submissionId: submission.id, message: "Binance could not be reached. Your transaction reference is saved; use Check again later." });
      }
    }
    if (action === "refresh_payment") {
      const submissionId = String(body.submissionId || "");
      const { data: submission } = await admin.from("payment_submissions").select("*").eq("id", submissionId).eq("telegram_customer_id", customer.id).eq("provider", "binance_pay_api").maybeSingle();
      if (!submission) return json({ error: "SUBMISSION_NOT_FOUND" }, 404);
      if (submission.status === "verified") return json({ ok: true, state: "verified", message: "This payment has already been verified." });
      if (submission.status === "rejected") return json({ error: "PAYMENT_REJECTED", message: submission.review_note || "This payment reference was rejected." }, 409);
      if (submission.last_verification_at && Date.now() - new Date(submission.last_verification_at).getTime() < 60000) {
        return json({ ok: true, state: "pending", message: "Please wait at least 60 seconds between Binance verification checks." }, 429);
      }
      const { data: order } = await admin.from("orders").select("*").eq("id", submission.order_id).eq("telegram_customer_id", customer.id).maybeSingle();
      if (!order || order.status !== "awaiting_payment") return json({ error: "ORDER_NOT_PAYABLE" }, 409);
      try {
        const result = await checkPayment(order, customer, submission, settings);
        return json({ ok: true, submissionId: submission.id, ...result });
      } catch (e) {
        await admin.from("payment_submissions").update({ review_note: "Binance API temporarily unavailable. Use Check again later.", last_verification_at: new Date().toISOString() }).eq("id", submission.id);
        return json({ ok: true, state: "pending", submissionId: submission.id, message: "Binance could not be reached. Your transaction reference is saved; use Check again later." });
      }
    }
    return json({ error: "UNKNOWN_ACTION" }, 400);
  } catch (e) {
    const message = String((e as any)?.message || e);
    const status = message.startsWith("TELEGRAM_") ? 401 : 500;
    return json({ error: message }, status);
  }
});
