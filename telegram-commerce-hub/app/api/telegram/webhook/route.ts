import {NextRequest,NextResponse} from 'next/server';
export const runtime='nodejs';
const api=(method:string)=>`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`;
async function send(chatId:number|string,text:string,extra:any={}){return fetch(api('sendMessage'),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({chat_id:chatId,text,parse_mode:'HTML',...extra})})}
function esc(s:string){return s.replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]!))}
export async function POST(req:NextRequest){
 const secret=process.env.TELEGRAM_WEBHOOK_SECRET;
 if(!process.env.TELEGRAM_BOT_TOKEN||!secret||req.headers.get('x-telegram-bot-api-secret-token')!==secret)return NextResponse.json({ok:false},{status:401});
 const update=await req.json();const msg=update.message;if(!msg?.chat?.id)return NextResponse.json({ok:true});
 const chatId=msg.chat.id;const input=String(msg.text||'').trim();const appUrl=(process.env.APP_URL||'https://nova-telegram-commerce.onrender.com').replace(/\/$/,'')+'/miniapp';
 const keyboard={keyboard:[[{text:'Open Gold Feather Premium',web_app:{url:appUrl}}],[{text:'Browse catalogue'},{text:'My orders'}]],resize_keyboard:true};
 const welcome=`<b>${esc(process.env.STORE_NAME||'GOLD FEATHER PREMIUM')}</b>\nWelcome. Open our Telegram store to register, browse products, pay and track deliveries.`;
 if(input.startsWith('/start')||input.startsWith('/help')){await send(chatId,welcome,{reply_markup:keyboard});return NextResponse.json({ok:true})}
 if(input==='/catalog'||input==='Browse catalogue'||input.startsWith('/catalog')){await send(chatId,'Browse products, choose a plan and complete checkout inside the secure Mini App.',{reply_markup:{inline_keyboard:[[{text:'Open Gold Feather Premium',web_app:{url:appUrl}}]]}});return NextResponse.json({ok:true})}
 if(input==='/orders'||input==='My orders'||input.startsWith('/orders')){await send(chatId,'Your profile, payment status and digital deliveries are available in your customer account.',{reply_markup:{inline_keyboard:[[{text:'Open my account',web_app:{url:appUrl}}]]}});return NextResponse.json({ok:true})}
 await send(chatId,'Use /start to open Gold Feather Premium.',{reply_markup:keyboard});return NextResponse.json({ok:true});
}
