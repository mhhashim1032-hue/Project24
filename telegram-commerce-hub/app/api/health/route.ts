import {NextResponse} from 'next/server';

export async function GET(){
 const token=Boolean(process.env.TELEGRAM_BOT_TOKEN);
 const appUrl=Boolean(process.env.APP_URL);
 const webhook=Boolean(process.env.TELEGRAM_WEBHOOK_SECRET&&appUrl);
 const supabase=Boolean(process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL);
 const anonKey=Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
 const serviceRole=Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
 return NextResponse.json({
  ok:true,service:'gold-feather-premium-commerce-os',timestamp:new Date().toISOString(),
  telegramConfigured:token,webhookConfigured:Boolean(token&&webhook),databaseConfigured:Boolean(supabase&&anonKey),
  customerRegistrationConfigured:Boolean(supabase&&serviceRole),
  binanceConfigured:null,binanceSecretsLocation:'supabase_edge_function_secrets',
  binanceHealthCheck:'Not readable from Vercel; tested during payment verification',
  // The Mini App authenticates with Telegram initData and calls the Supabase Edge Function.
  // It does not require an unrelated INTERNAL_API_SECRET environment variable.
  miniAppConfigured:Boolean(token&&appUrl&&supabase&&anonKey)
 });
}
