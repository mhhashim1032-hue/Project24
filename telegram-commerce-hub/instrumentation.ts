import { getServerSecret } from '@/lib/server-secrets';

export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  // Telegram rate-limits bot configuration. Keep setup manual; do not call Telegram on every Render restart.
  if (process.env.TELEGRAM_SETUP_ON_STARTUP !== 'true') return;
  const token=await getServerSecret('telegram_bot_token','TELEGRAM_BOT_TOKEN'), secret=process.env.TELEGRAM_WEBHOOK_SECRET, appUrl=process.env.APP_URL;
  if(!token||!secret||!appUrl)return;
  const base='https://api.telegram.org/bot'+token+'/';
  const call=async(method:string,body:Record<string,unknown>)=>{const r=await fetch(base+method,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(8000)});const d=await r.json();if(!r.ok||!d.ok)throw new Error(d.description||method+' failed');return d};
  try{
    await call('setMyName',{name:'Gold Feather Premium',language_code:'en'});
    await call('setMyDescription',{description:'Gold Feather Premium — premium digital products, software and subscriptions with secure Binance Pay checkout.'});
    await call('setMyShortDescription',{short_description:'Shop premium digital products and subscriptions.'});
    await call('setMyCommands',{commands:[{command:'start',description:'Open Gold Feather Premium'},{command:'catalog',description:'Browse software and subscriptions'},{command:'orders',description:'View your orders'},{command:'help',description:'Get store help'}]});
    await call('setChatMenuButton',{menu_button:{type:'web_app',text:'Open Store',web_app:{url:appUrl.replace(/\/$/,'')+'/miniapp'}}});
    await call('setWebhook',{url:appUrl.replace(/\/$/,'')+'/api/telegram/webhook',secret_token:secret,allowed_updates:['message','callback_query'],drop_pending_updates:false});
    console.info('Gold Feather Premium Telegram bot configured.');
  }catch(error){console.error('Telegram bot setup failed:',error)}
}
