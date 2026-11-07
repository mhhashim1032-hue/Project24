import {createHmac,timingSafeEqual} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
export function validateTelegramInitData(raw:string,botToken:string){
 const params=new URLSearchParams(raw);const hash=params.get('hash');if(!hash)throw new Error('Telegram signature missing');
 const authDate=Number(params.get('auth_date'));if(!Number.isFinite(authDate)||Math.abs(Date.now()/1000-authDate)>3600)throw new Error('Telegram session expired. Reopen the Mini App.');
 const data=[...params.entries()].filter(([k])=>k!=='hash'&&k!=='signature').sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}=${v}`).join('\n');
 const secret=createHmac('sha256','WebAppData').update(botToken).digest();
 const expected=createHmac('sha256',secret).update(data).digest('hex');
 const a=Buffer.from(expected,'hex'),b=Buffer.from(hash,'hex');if(a.length!==b.length||!timingSafeEqual(a,b))throw new Error('Invalid Telegram signature');
 const userRaw=params.get('user');if(!userRaw)throw new Error('Telegram user profile missing');
 return JSON.parse(userRaw);
}
export function dbInternal(){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL;const key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;const secret=process.env.INTERNAL_API_SECRET;
 if(!url||!key||!secret)throw new Error('Server integration is not configured');
 return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{'x-internal-api-secret':secret}}});
}
export async function telegramUser(req:Request){
 const token=process.env.TELEGRAM_BOT_TOKEN;if(!token)throw new Error('Telegram bot is not connected yet');
 const body=await req.clone().json();const raw=String(body.initData||'');if(!raw)throw new Error('Telegram launch data missing');
 return validateTelegramInitData(raw,token);
}
