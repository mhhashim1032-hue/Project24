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

async function diagnostics(token: string, webhookUrl: string, miniAppUrl: string) {
  const [webhookInfo, menuButton, bot] = await Promise.all([
    telegram(token, 'getWebhookInfo'),
    telegram(token, 'getChatMenuButton'),
    telegram(token, 'getMe'),
  ]);
  return {
    webhookInfo,
    menuButton,
    bot: { id: bot?.id, username: bot?.username },
    verification: {
      webhook: String(webhookInfo?.url || '') === webhookUrl,
      menuButton: menuButton?.type === 'web_app' && String(menuButton?.web_app?.url || '') === miniAppUrl,
      pendingUpdateCount: Number(webhookInfo?.pending_update_count || 0),
      lastWebhookError: webhookInfo?.last_error_message || null,
    },
  };
}

export async function POST(req: NextRequest) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret || req.headers.get('x-setup-secret') !== secret) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const appUrl = (process.env.APP_URL || '').replace(/\/$/, '');
  if (!token || !appUrl) {
    return NextResponse.json({ ok: false, error: 'Telegram bot token or APP_URL is not configured' }, { status: 503 });
  }

  const webhookUrl = `${appUrl}/api/telegram/webhook`;
  const miniAppUrl = `${appUrl}/miniapp`;

  try {
    // Prioritize the actual cutover. Preserve queued updates so /start messages are not discarded.
    await telegram(token, 'setWebhook', {
      url: webhookUrl,
      secret_token: secret,
      allowed_updates: ['message', 'callback_query'],
      drop_pending_updates: false,
    });
    await telegram(token, 'setChatMenuButton', {
      menu_button: { type: 'web_app', text: 'Open Store', web_app: { url: miniAppUrl } },
    });

    const result = await diagnostics(token, webhookUrl, miniAppUrl);
    const ok = result.verification.webhook && result.verification.menuButton;
    return NextResponse.json({ ok, ...result }, { status: ok ? 200 : 502 });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : 'Telegram cutover failed',
    }, { status: 502 });
  }
}
