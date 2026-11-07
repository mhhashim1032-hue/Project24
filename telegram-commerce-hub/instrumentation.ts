export async function register() {
 if (process.env.NEXT_RUNTIME !== 'nodejs') return;
 const token=process.env.TELEGRAM_BOT_TOKEN,secret=process.env.TELEGRAM_WEBHOOK_SECRET,appUrl=process.env.APP_URL;
 if(!token||!secret||!appUrl)return;
 const api=(method:string)=>'https://api.telegram.org/bot'+token+'/'+method;
 const call=async(method:string,body:any)=>{const r=await fetch(api(method),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(8000)});const j=await r.json();if(!j.ok)console.error('Telegram '+method+' failed:',j.description);return j};
 try{
  const base=appUrl.replace(/\/$/,'');
  await call('setWebhook',{url:base+'/api/telegram/webhook',secret_token:secret,allowed_updates:['message','callback_query'],drop_pending_updates:false});
  await call('setMyName',{name:'Gold Feather Premium'});
  await call('setMyDescription',{description:'Gold Feather Premium — premium software, digital products and subscriptions. Browse, order and track your purchases securely.'});
  await call('setMyShortDescription',{short_description:'Premium software and subscriptions. Browse and purchase securely.'});
  await call('setMyCommands',{commands:[{command:'start',description:'Open Gold Feather Premium'},{command:'catalog',description:'Browse software and subscriptions'},{command:'orders',description:'View your orders'},{command:'help',description:'Get store help'}]});
  await call('setChatMenuButton',{menu_button:{type:'web_app',text:'Open Store',web_app:{url:base+'/miniapp'}}});
  console.info('Gold Feather Premium Telegram bot and Mini App configured.');
 }catch(error){console.error('Telegram startup configuration failed:',error)}
}
