import {NextRequest,NextResponse} from 'next/server';
export const runtime='nodejs';
const api=(method:string)=>`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`;
async function send(chatId:number|string,text:string){return fetch(api('sendMessage'),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({chat_id:chatId,text,parse_mode:'HTML'})})}
function esc(s:string){return s.replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]!))}
export async function POST(req:NextRequest){
 const secret=process.env.TELEGRAM_WEBHOOK_SECRET;
 if(!process.env.TELEGRAM_BOT_TOKEN||!secret||req.headers.get('x-telegram-bot-api-secret-token')!==secret)return NextResponse.json({ok:false},{status:401});
 const update=await req.json();const msg=update.message;if(!msg?.chat?.id)return NextResponse.json({ok:true});
 const chatId=msg.chat.id;const input=String(msg.text||'').trim();
 const welcome=`<b>${esc(process.env.STORE_NAME||'GOLD FEATHER PREMIUM')}</b>\nWelcome. Your secure store, customer profile, payments and orders are available in the Telegram Mini App.\n\nTap the <b>Open Store</b> menu button beside the message field to launch it.`;
 if(input.startsWith('/start')||input.startsWith('/help')){await send(chatId,welcome);return NextResponse.json({ok:true})}
 if(input==='/catalog'||input==='Browse catalogue'||input.startsWith('/catalog')){await send(chatId,'To browse products and plans, tap the <b>Open Store</b> menu button beside the message field.');return NextResponse.json({ok:true})}
 if(input==='/orders'||input==='My orders'||input.startsWith('/orders')){await send(chatId,'To view your profile, payment status and digital deliveries, tap the <b>Open Store</b> menu button beside the message field.');return NextResponse.json({ok:true})}
 await send(chatId,'Use /start to open Gold Feather Premium.');return NextResponse.json({ok:true});
}
