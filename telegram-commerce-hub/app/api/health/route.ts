import {NextResponse} from 'next/server';
export async function GET(){
 const token=Boolean(process.env.TELEGRAM_BOT_TOKEN);
 const webhook=Boolean(process.env.TELEGRAM_WEBHOOK_SECRET&&process.env.APP_URL);
 const supabase=Boolean(process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL);
 const serviceRole=Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
 return NextResponse.json({
  ok:true,service:'gold-feather-premium-commerce-os',timestamp:new Date().toISOString(),
  telegramConfigured:token,webhookConfigured:webhook,databaseConfigured:Boolean(supabase&&process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  customerRegistrationConfigured:Boolean(supabase&&serviceRole),binanceConfigured:Boolean(process.env.BINANCE_API_KEY&&process.env.BINANCE_API_SECRET),
  miniAppConfigured:Boolean(token&&process.env.INTERNAL_API_SECRET)
 });
}
