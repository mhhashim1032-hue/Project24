export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const appUrl = process.env.APP_URL;
  if (!token || !secret || !appUrl) return;
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        url: `${appUrl.replace(/\/$/, '')}/api/telegram/webhook`,
        secret_token: secret,
        allowed_updates: ['message', 'callback_query'],
        drop_pending_updates: false,
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) console.error('Telegram webhook registration returned HTTP', response.status);
    else {
      const result = await response.json();
      if (!result.ok) console.error('Telegram webhook registration failed:', result.description);
      else console.info('Telegram webhook registered.');
    }
  } catch (error) {
    console.error('Telegram webhook registration failed:', error);
  }
}
