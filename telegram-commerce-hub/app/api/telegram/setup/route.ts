import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

type TelegramResult = { ok?: boolean; description?: string; result?: any };

async function telegram(token: string, method: string, body: Record<string, unknown> = {}) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
    cache: 'no-store',
  });
  const data = (await response.json()) as TelegramResult;
  if (!response.ok || !data.ok) {
    throw new Error(data.description || `${method} failed (HTTP ${response.status})`);
  }
  return data.result;
}

export async function POST(req: NextRequest) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret || req.headers.get('x-setup-secret') !== secret) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const appUrl = (process.env.APP_URL || '').replace(/\/$/, '');
  if (!token || !appUrl) {
    return NextResponse.json({
      ok: false,
      error: 'Telegram bot token or APP_URL is not configured',
    }, { status: 503 });
  }

  const webhookUrl = `${appUrl}/api/telegram/webhook`;
  const steps: Record<string, boolean> = {};

  try {
    await telegram(token, 'setMyName', {
      name: 'Gold Feather Premium',
      language_code: 'en',
    });
    steps.botName = true;

    await telegram(token, 'setMyDescription', {
      description: 'Gold Feather Premium — premium digital products, software and subscriptions with secure checkout.',
    });
    steps.botDescription = true;

    await telegram(token, 'setMyShortDescription', {
      short_description: 'Shop premium digital products and subscriptions.',
    });
    steps.shortDescription = true;

    await telegram(token, 'setMyCommands', {
      commands: [
        { command: 'start', description: 'Open Gold Feather Premium' },
        { command: 'catalog', description: 'Browse software and subscriptions' },
        { command: 'orders', description: 'View your orders' },
        { command: 'help', description: 'Get store help' },
      ],
    });
    steps.commands = true;

    await telegram(token, 'setChatMenuButton', {
      menu_button: {
        type: 'web_app',
        text: 'Open Store',
        web_app: { url: `${appUrl}/miniapp` },
      },
    });
    steps.menuButton = true;

    await telegram(token, 'setWebhook', {
      url: webhookUrl,
      secret_token: secret,
      allowed_updates: ['message', 'callback_query'],
      drop_pending_updates: false,
    });
    steps.webhookSet = true;

    const [webhookInfo, menuButton] = await Promise.all([
      telegram(token, 'getWebhookInfo'),
      telegram(token, 'getChatMenuButton'),
    ]);

    const verifiedWebhook = String(webhookInfo?.url || '') === webhookUrl;
    const verifiedMenuButton = menuButton?.type === 'web_app'
      && String(menuButton?.web_app?.url || '') === `${appUrl}/miniapp`;

    return NextResponse.json({
      ok: verifiedWebhook && verifiedMenuButton,
      steps,
      verification: {
        webhook: verifiedWebhook,
        menuButton: verifiedMenuButton,
        pendingUpdateCount: Number(webhookInfo?.pending_update_count || 0),
        lastWebhookError: webhookInfo?.last_error_message || null,
      },
    }, { status: verifiedWebhook && verifiedMenuButton ? 200 : 502 });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      steps,
      error: error instanceof Error ? error.message : 'Telegram setup failed',
    }, { status: 502 });
  }
}
