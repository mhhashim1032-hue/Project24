// Temporary read-only Telegram post-cutover verification for Vercel production builds.
const appUrl = (process.env.APP_URL || '').replace(/\/$/, '');
if (appUrl !== 'https://gold-feather-premium-pakstylebd.vercel.app') {
  console.log('[telegram-check] skipped: not the Vercel production deployment');
} else {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.error('[telegram-check] TELEGRAM_BOT_TOKEN missing from Vercel build environment');
  } else {
    const call = async method => {
      const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
        signal: AbortSignal.timeout(12000),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.description || `${method} HTTP ${response.status}`);
      return data.result;
    };
    try {
      await new Promise(resolve => setTimeout(resolve, 12000));
      const [info, menu, bot] = await Promise.all([
        call('getWebhookInfo'),
        call('getChatMenuButton'),
        call('getMe'),
      ]);
      console.log('[telegram-check] post-cutover', JSON.stringify({
        botUsername: bot?.username,
        webhookUrl: info?.url,
        webhookOk: info?.url === `${appUrl}/api/telegram/webhook`,
        menuButtonType: menu?.type,
        menuAppUrl: menu?.web_app?.url,
        menuOk: menu?.type === 'web_app' && menu?.web_app?.url === `${appUrl}/miniapp`,
        pendingUpdateCount: info?.pending_update_count ?? 0,
        lastWebhookError: info?.last_error_message ?? null,
      }));
    } catch (error) {
      console.error('[telegram-check] failed:', error instanceof Error ? error.message : String(error));
    }
  }
}
