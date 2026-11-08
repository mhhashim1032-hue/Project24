// One-time Vercel production cutover. Gated by TELEGRAM_SETUP_ONCE_KEY and VERCEL_ENV.
const enabled = Boolean(process.env.TELEGRAM_SETUP_ONCE_KEY);
if (!enabled) {
  console.log('[telegram-cutover] skipped: not an armed production build');
} else {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const appUrl = (process.env.APP_URL || '').replace(/\/$/, '');
  if (!token || !secret || !appUrl) {
    console.error('[telegram-cutover] missing required production environment configuration');
  } else {
    const call = async (method, body = {}) => {
      const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(12000),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.description || `${method} HTTP ${response.status}`);
      return data.result;
    };
    const webhookUrl = `${appUrl}/api/telegram/webhook`;
    const miniAppUrl = `${appUrl}/miniapp`;
    try {
      await call('setWebhook', {
        url: webhookUrl,
        secret_token: secret,
        allowed_updates: ['message', 'callback_query'],
        drop_pending_updates: false,
      });
      console.log('[telegram-cutover] webhook set');
      await call('setChatMenuButton', {
        menu_button: { type: 'web_app', text: 'Open Store', web_app: { url: miniAppUrl } },
      });
      console.log('[telegram-cutover] menu button set');
      const [info, menu] = await Promise.all([
        call('getWebhookInfo'),
        call('getChatMenuButton'),
      ]);
      const webhookOk = info?.url === webhookUrl;
      const menuOk = menu?.type === 'web_app' && menu?.web_app?.url === miniAppUrl;
      console.log('[telegram-cutover] verification', JSON.stringify({
        webhookOk, menuOk, pendingUpdateCount: info?.pending_update_count ?? 0,
        lastWebhookError: info?.last_error_message ?? null,
        menuButtonType: menu?.type,
      }));
      if (!webhookOk || !menuOk) console.error('[telegram-cutover] verification failed');
    } catch (error) {
      console.error('[telegram-cutover] failed:', error instanceof Error ? error.message : String(error));
    }
  }
}
