import { NextRequest, NextResponse } from 'next/server';
import { getServerSecret } from '@/lib/server-secrets';

export const runtime = 'nodejs';
export const maxDuration = 60;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const BATCH_SIZE = 8;

export async function POST(req: NextRequest) {
  try {
    const bearer = req.headers.get('authorization') || '';
    if (!bearer.startsWith('Bearer ')) return NextResponse.json({ error: 'Admin authentication required.' }, { status: 401 });
    if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY) {
      return NextResponse.json({ error: 'Broadcast service is not configured.' }, { status: 503 });
    }

    const auth = await fetch(SUPABASE_URL + '/auth/v1/user', {
      headers: { apikey: ANON_KEY, authorization: bearer }, cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    if (!auth.ok) return NextResponse.json({ error: 'Invalid admin session.' }, { status: 401 });
    const user = await auth.json();
    const profileRes = await fetch(SUPABASE_URL + '/rest/v1/profiles?select=role&id=eq.' + encodeURIComponent(user.id) + '&limit=1', {
      headers: { apikey: SERVICE_KEY, authorization: 'Bearer ' + SERVICE_KEY }, cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    const profiles = await profileRes.json();
    if (!profileRes.ok || profiles?.[0]?.role !== 'admin') return NextResponse.json({ error: 'Admin access required.' }, { status: 403 });

    const body = await req.json();
    const message = String(body.message || '').trim();
    const offset = Number(body.offset ?? 0);
    if (!message || message.length > 3900) return NextResponse.json({ error: 'Enter a message between 1 and 3900 characters.' }, { status: 400 });
    if (!Number.isSafeInteger(offset) || offset < 0) return NextResponse.json({ error: 'Invalid broadcast offset.' }, { status: 400 });

    const botToken = await getServerSecret('telegram_bot_token', 'TELEGRAM_BOT_TOKEN');
    if (!botToken) return NextResponse.json({ error: 'Telegram bot token is not configured.' }, { status: 503 });

    const customersRes = await fetch(SUPABASE_URL + '/rest/v1/telegram_customers?select=telegram_user_id&is_blocked=eq.false&order=created_at.asc,telegram_user_id.asc&limit=' + BATCH_SIZE + '&offset=' + offset, {
      headers: { apikey: SERVICE_KEY, authorization: 'Bearer ' + SERVICE_KEY }, cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    const customers = await customersRes.json();
    if (!customersRes.ok || !Array.isArray(customers)) return NextResponse.json({ error: 'Could not load recipients.' }, { status: 502 });

    let sent = 0, failed = 0;
    for (const customer of customers) {
      try {
        const response = await fetch('https://api.telegram.org/bot' + botToken + '/sendMessage', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ chat_id: customer.telegram_user_id, text: message, disable_web_page_preview: false }),
          signal: AbortSignal.timeout(5000),
        });
        const result = await response.json().catch(() => ({}));
        if (response.ok && result.ok) sent++; else failed++;
      } catch {
        failed++;
      }
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    return NextResponse.json({ ok: true, sent, failed, nextOffset: offset + customers.length, done: customers.length < BATCH_SIZE });
  } catch (error) {
    console.error('Broadcast batch failed:', error);
    return NextResponse.json({ error: 'Broadcast batch failed before completion. Retry from the last confirmed offset.' }, { status: 500 });
  }
}
