import {NextResponse} from 'next/server';
import {createHmac} from 'node:crypto';
import {dbInternal,telegramUser} from '@/lib/telegram-server';
export const runtime='nodejs';
function sign(query:string,secret:string){return createHmac('sha256',secret).update(query).digest('hex')}
export async function POST(req:Request){
 try{
  const user=await telegramUser(req);const {paymentId}=await req.json();if(!paymentId)throw new Error('Missing payment reference');
  const db=dbInternal();
  const {data:context,error:contextError}=await db.rpc('telegram_get_payment_context',{p_telegram_user_id:String(user.id),p_payment_id:paymentId});
  if(contextError)throw contextError;
  if(context.status==='verified')return NextResponse.json({ok:true,status:'already_verified'});
  if(context.status!=='submitted')return NextResponse.json({ok:true,status:context.status});
  const key=process.env.BINANCE_API_KEY,secret=process.env.BINANCE_API_SECRET,verifySecret=process.env.PAYMENT_VERIFY_SECRET;
  if(!key||!secret||!verifySecret)return NextResponse.json({ok:true,status:'awaiting_binance_api',message:'Automatic verification starts when the read-only Binance API credentials are configured.'});
  const {data:settings,error:settingsError}=await db.from('bot_settings').select('binance_pay_id').eq('id',1).maybeSingle();
  if(settingsError||!settings?.binance_pay_id)return NextResponse.json({ok:true,status:'awaiting_pay_id',message:'The store owner has not configured the receiving Binance Pay ID.'});
  const {data:slot,error:slotError}=await db.rpc('claim_binance_verification_slot',{p_secret:verifySecret});
  if(slotError)throw slotError;if(slot!==true)return NextResponse.json({ok:true,status:'rate_limited',message:'Binance Pay history is checked at a controlled interval. Please retry in about one minute.'});
  const endTime=Date.now();const query=new URLSearchParams({endTime:String(endTime),limit:'100',recvWindow:'5000',timestamp:String(endTime)}).toString();
  const response=await fetch('https://api.binance.com/sapi/v1/pay/transactions?'+query+'&signature='+sign(query,secret),{headers:{'X-MBX-APIKEY':key},cache:'no-store',signal:AbortSignal.timeout(12000)});
  const result=await response.json();if(!response.ok||result.success!==true||!Array.isArray(result.data))throw new Error('Binance Pay history is temporarily unavailable. Check the read-only API key permissions.');
  const tx=result.data.find((x:any)=>String(x.transactionId)===String(context.transaction_reference));
  if(!tx)return NextResponse.json({ok:true,status:'pending',message:'This transaction is not visible in Binance Pay history yet. Retry later or wait for manual review.'});
  const receiverPayId=String(tx.receiverInfo?.accountId||''),incoming=Number(tx.amount)>0,supportedType=['PAY','C2C'].includes(String(tx.orderType||''));
  const sameReceiver=receiverPayId===String(settings.binance_pay_id).trim(),sameAmount=Math.abs(Number(tx.amount)-Number(context.amount))<0.00000001,sameCurrency=String(tx.currency||'')===String(context.currency||'');
  const payerBinanceId=String(tx.payerInfo?.binanceId||''),payerMatches=!!context.binance_id&&payerBinanceId===String(context.binance_id).trim();
  const txTime=Number(tx.transactionTime||0),createdAt=new Date(context.order_created_at).getTime(),expiresAt=new Date(context.order_expires_at).getTime();
  if(!incoming||!supportedType||!sameReceiver||!sameAmount||!sameCurrency||!payerMatches||!Number.isFinite(txTime)||txTime<createdAt||txTime>expiresAt){
   await db.rpc('telegram_reject_payment',{p_payment_id:paymentId,p_reason:'Binance Pay transaction did not match payer, recipient, amount, currency, type or time window'});
   return NextResponse.json({ok:true,status:'rejected',message:'The transaction did not match the order details and was rejected. Contact support if you believe this is an error.'});
  }
  const payload={transactionId:String(tx.transactionId),amount:String(tx.amount),currency:String(tx.currency),receiverPayId,income:incoming,orderType:String(tx.orderType),transactionTime:txTime,payerBinanceId};
  const {data:verified,error:verifyError}=await db.rpc('confirm_binance_payment',{p_secret:verifySecret,p_payment_id:paymentId,p_payload:payload});
  if(verifyError)throw verifyError;
  return NextResponse.json({ok:true,status:verified?.status||'paid',message:verified?.status==='fulfilled'?'Payment verified. Your digital product is ready.':'Payment verified. Your order is paid.'});
 }catch(e:any){return NextResponse.json({error:e.message||'Verification failed'},{status:400})}
}
