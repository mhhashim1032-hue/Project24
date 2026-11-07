import {NextResponse} from 'next/server';
import {dbInternal,telegramUser} from '@/lib/telegram-server';
export const runtime='nodejs';
export async function POST(req:Request){
 try{
  const user=await telegramUser(req);
  const body=await req.json();
  const db=dbInternal();
  if(body.action==='save_binance_id'){const {data,error}=await db.rpc('telegram_save_binance_id',{p_telegram_user_id:String(user.id),p_binance_id:String(body.binanceId||'').trim()});if(error)throw error;return NextResponse.json({ok:true,profile:data})}if(body.action==='create_order'){
   const {data,error}=await db.rpc('telegram_create_order_idempotent',{p_telegram_user_id:String(user.id),p_product_id:body.productId,p_plan_id:body.planId,p_idempotency_key:body.idempotencyKey});
   if(error)throw error;
   return NextResponse.json({ok:true,order:data});
  }
  if(body.action==='submit_payment'){
   const {data,error}=await db.rpc('telegram_submit_payment',{p_telegram_user_id:String(user.id),p_order_id:body.orderId,p_reference:String(body.reference||'').trim()});
   if(error)throw error;
   return NextResponse.json({ok:true,payment:data});
  }
  if(body.action==='orders'){
   const {data,error}=await db.rpc('telegram_get_customer_orders',{p_telegram_user_id:String(user.id)});
   if(error)throw error;
   return NextResponse.json({ok:true,orders:data||[]});
  }
  return NextResponse.json({error:'Unsupported Mini App action'},{status:400});
 }catch(e:any){return NextResponse.json({error:e.message||'Request failed'},{status:400})}
}
