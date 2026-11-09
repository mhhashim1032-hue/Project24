export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // Telegram setup is an explicit, authenticated admin action handled by the Supabase Edge Function.
  // Avoid external Telegram side effects during Vercel builds, cold starts or server restarts.
}
