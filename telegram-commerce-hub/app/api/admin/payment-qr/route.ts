import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 30;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const QR_KEYS = new Set(['binance_pay_qr_url', 'usdt_tron_qr_url', 'usdt_bep20_qr_url']);
const MIME_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

export async function POST(req: NextRequest) {
  try {
    if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY) {
      return NextResponse.json({ error: 'Payment QR upload service is not configured on the server.' }, { status: 503 });
    }
    const bearer = req.headers.get('authorization') || '';
    if (!bearer.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Admin authentication required. Please sign in again.' }, { status: 401 });
    }

    const auth = await fetch(SUPABASE_URL + '/auth/v1/user', {
      headers: { apikey: ANON_KEY, authorization: bearer },
      cache: 'no-store',
    });
    if (!auth.ok) return NextResponse.json({ error: 'Your admin session is invalid or expired. Sign in again.' }, { status: 401 });
    const user = await auth.json();

    const profileRes = await fetch(
      SUPABASE_URL + '/rest/v1/profiles?select=role&id=eq.' + encodeURIComponent(user.id) + '&limit=1',
      { headers: { apikey: SERVICE_KEY, authorization: 'Bearer ' + SERVICE_KEY }, cache: 'no-store' },
    );
    const profiles = await profileRes.json();
    if (!profileRes.ok || profiles?.[0]?.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required.' }, { status: 403 });
    }

    const form = await req.formData();
    const key = String(form.get('key') || '');
    const file = form.get('file');
    if (!QR_KEYS.has(key)) return NextResponse.json({ error: 'Unknown payment QR field.' }, { status: 400 });
    if (!(file instanceof File)) return NextResponse.json({ error: 'Choose a QR image file first.' }, { status: 400 });
    const extension = MIME_EXT[file.type];
    if (!extension) return NextResponse.json({ error: 'Use a PNG, JPG, or WebP image.' }, { status: 400 });
    if (file.size <= 0 || file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: 'QR image must be larger than 0 bytes and no more than 5 MB.' }, { status: 400 });
    }

    const path = 'payment-qr/' + key + '-' + Date.now() + '.' + extension;
    const bytes = await file.arrayBuffer();
    const upload = await fetch(SUPABASE_URL + '/storage/v1/object/product-images/' + path, {
      method: 'POST',
      headers: {
        apikey: SERVICE_KEY,
        authorization: 'Bearer ' + SERVICE_KEY,
        'content-type': file.type,
        'cache-control': '3600',
        'x-upsert': 'true',
      },
      body: bytes,
      cache: 'no-store',
    });
    if (!upload.ok) {
      const detail = await upload.text();
      console.error('Payment QR storage upload failed:', upload.status, detail);
      return NextResponse.json({ error: 'Storage upload failed (' + upload.status + '): ' + detail.slice(0, 500) }, { status: 502 });
    }

    const publicUrl = SUPABASE_URL + '/storage/v1/object/public/product-images/' + path;
    const save = await fetch(SUPABASE_URL + '/rest/v1/bot_settings?id=eq.1', {
      method: 'PATCH',
      headers: {
        apikey: SERVICE_KEY,
        authorization: 'Bearer ' + SERVICE_KEY,
        'content-type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({ [key]: publicUrl }),
      cache: 'no-store',
    });
    const rows = await save.json().catch(() => []);
    if (!save.ok || !Array.isArray(rows) || !rows[0]?.[key]) {
      console.error('Payment QR settings save failed:', save.status, rows);
      return NextResponse.json({ error: 'Image uploaded, but saving its URL in payment settings failed. ' + JSON.stringify(rows).slice(0, 400) }, { status: 502 });
    }

    return NextResponse.json({ ok: true, key, url: rows[0][key], message: 'QR image uploaded and saved successfully.' });
  } catch (error) {
    console.error('Payment QR upload failed:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Payment QR upload failed.' }, { status: 500 });
  }
}
