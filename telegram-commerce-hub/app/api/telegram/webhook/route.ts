import { NextRequest, NextResponse } from 'next/server';
import { getServerSecret } from '@/lib/server-secrets';

export const runtime = 'nodejs';

const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;
const APP_URL = (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '');
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ckresrujdienuqczzyki.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

type TelegramUser = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
};

const api = (token: string, method: string) => `https://api.telegram.org/bot${token}/${method}`;

async function telegram(token: string, method: string, body: Record<string, unknown>) {
  const response = await fetch(api(token, method), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error(result.description || `Telegram ${method} failed`);
  return result;
}

async function registerCustomer(user: TelegramUser) {
  if (!SERVICE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY is missing in Vercel');
  const lookup = await fetch(`${SUPABASE_URL}/rest/v1/telegram_customers?telegram_user_id=eq.${encodeURIComponent(String(user.id))}&select=id`, {
    headers: { apikey: SERVICE_KEY, authorization: `Bearer ${SERVICE_KEY}` },
    signal: AbortSignal.timeout(8000),
  });
  if (!lookup.ok) throw new Error('Could not check existing Telegram customer registration');
  const wasNew = ((await lookup.json()) || []).length === 0;
  const response = await fetch(`${SUPABASE_URL}/rest/v1/telegram_customers?on_conflict=telegram_user_id&select=id,telegram_user_id,referral_code`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      authorization: `Bearer ${SERVICE_KEY}`,
      'content-type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify({
      telegram_user_id: String(user.id),
      first_name: String(user.first_name || 'Telegram user').slice(0, 128),
      last_name: user.last_name ? String(user.last_name).slice(0, 128) : null,
      username: user.username ? String(user.username).slice(0, 64) : null,
      language_code: user.language_code ? String(user.language_code).slice(0, 16) : null,
      is_premium: Boolean(user.is_premium),
      updated_at: new Date().toISOString(),
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Supabase customer registration failed (${response.status}): ${detail.slice(0, 300)}`);
  }
  const rows = await response.json();
  return Array.isArray(rows) && rows[0] ? { ...rows[0], wasNew } : null;
}

function storeKeyboard() {
  if (!APP_URL) return undefined;
  return {
    inline_keyboard: [[{
      text: '🛍 Open Store',
      web_app: { url: `${APP_URL}/miniapp` },
    }]],
  };
}

export async function POST(req: NextRequest) {
  if (!WEBHOOK_SECRET || req.headers.get('x-telegram-bot-api-secret-token') !== WEBHOOK_SECRET) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const token = await getServerSecret('telegram_bot_token', 'TELEGRAM_BOT_TOKEN');
  if (!token) return NextResponse.json({ ok: false, error: 'BOT_TOKEN_NOT_CONFIGURED' }, { status: 503 });

  try {
    const update = await req.json();
    const message = update.message;
    if (!message?.chat?.id) return NextResponse.json({ ok: true });

    const chatId = message.chat.id;
    const input = String(message.text || '').trim();
    const user = message.from as TelegramUser | undefined;
    const isStart = input.startsWith('/start') || input.startsWith('/help');

    if (isStart && user?.id) {
      const customer = await registerCustomer(user);
      if (!customer?.id) throw new Error('TELEGRAM_CUSTOMER_REGISTRATION_INCOMPLETE');
      const startPayload = input.split(/\s+/, 2)[1] || '';
      const referralCode = startPayload.startsWith('ref_') ? startPayload.slice(4).toLowerCase() : '';
      if (customer.wasNew && referralCode) {
        const referralResponse = await fetch(`${SUPABASE_URL}/rest/v1/rpc/apply_referral_onboarding`, {
          method: 'POST',
          headers: { apikey: SERVICE_KEY!, authorization: `Bearer ${SERVICE_KEY}`, 'content-type': 'application/json' },
          body: JSON.stringify({ p_new_customer_id: customer.id, p_referral_code: referralCode }),
          signal: AbortSignal.timeout(8000),
        });
        if (!referralResponse.ok) {
          const detail = await referralResponse.text();
          console.error('Referral attribution failed:', detail.slice(0, 300));
        }
      }

      const storeName = process.env.STORE_NAME || 'GOLD FEATHER PREMIUM';
      const text = `<b>${storeName}</b>\nWelcome, ${String(user.first_name || 'there').replace(/[&<>\"]/g, '')}! Your Telegram account is now registered. Open the store to browse products, place orders and manage your purchases.`;

      await telegram(token, 'sendMessage', {
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        reply_markup: storeKeyboard(),
      });
      return NextResponse.json({ ok: true, registered: true });
    }

    if (input.startsWith('/catalog') || input === 'Browse catalogue') {
      await telegram(token, 'sendMessage', {
        chat_id: chatId,
        text: 'Browse products and plans in the store:',
        reply_markup: storeKeyboard(),
      });
      return NextResponse.json({ ok: true });
    }

    if (input.startsWith('/orders') || input === 'My orders') {
      await telegram(token, 'sendMessage', {
        chat_id: chatId,
        text: 'Open the store to view your profile, payment status and digital deliveries:',
        reply_markup: storeKeyboard(),
      });
      return NextResponse.json({ ok: true });
    }

    await telegram(token, 'sendMessage', {
      chat_id: chatId,
      text: 'Use /start to register and open the store.',
      reply_markup: storeKeyboard(),
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Telegram webhook handler failed:', error);
    // Return a retryable status when Telegram delivery itself fails; registration is idempotent.
    return NextResponse.json({ ok: false, error: 'WEBHOOK_HANDLER_FAILED' }, { status: 500 });
  }
}
