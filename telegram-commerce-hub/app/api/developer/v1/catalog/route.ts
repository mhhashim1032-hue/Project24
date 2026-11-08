import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 15;

const URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Cache-Control': 'private, max-age=15',
};

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: cors });
}

async function supabase(path: string, init: RequestInit = {}) {
  const response = await fetch(URL + path, {
    ...init,
    headers: {
      apikey: SERVICE,
      authorization: 'Bearer ' + SERVICE,
      ...(init.headers || {}),
    },
    cache: 'no-store',
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error('DATABASE_REQUEST_FAILED');
  return response.json();
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: cors });
}

export async function GET(req: NextRequest) {
  if (!URL || !SERVICE) return json({ error: 'API_NOT_CONFIGURED' }, 503);
  const authorization = req.headers.get('authorization') || '';
  const match = authorization.match(/^Bearer (gf_live_[A-Za-z0-9_-]{40,})$/);
  if (!match) return json({ error: 'API_KEY_REQUIRED', message: 'Send your developer key in the Authorization: Bearer header.' }, 401);

  try {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(match[1]));
    const keyHash = Array.from(new Uint8Array(digest)).map(x => x.toString(16).padStart(2, '0')).join('');
    const keys = await supabase('/rest/v1/telegram_developer_api_keys?select=id,telegram_customer_id&key_hash=eq.' + keyHash + '&revoked_at=is.null&limit=1');
    const key = Array.isArray(keys) ? keys[0] : null;
    if (!key) return json({ error: 'INVALID_OR_REVOKED_API_KEY' }, 401);

    const products = await supabase('/rest/v1/products?select=id,slug,name,description,category,image_url,sort_order&is_active=eq.true&order=sort_order.asc&limit=500');
    const ids = (products || []).map((p: any) => p.id).filter(Boolean);
    let plans: any[] = [];
    if (ids.length) {
      const filter = ids.map((id: string) => '"' + id + '"').join(',');
      plans = await supabase('/rest/v1/product_plans?select=id,product_id,name,description,price,currency,duration_days,stock,quantity_discount_tiers&is_active=eq.true&product_id=in.(' + encodeURIComponent(filter) + ')&order=price.asc&limit=2000');
    }

    await supabase('/rest/v1/telegram_developer_api_keys?id=eq.' + key.id, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ last_used_at: new Date().toISOString() }),
    });

    const data = (products || []).map((product: any) => ({
      id: product.id,
      slug: product.slug,
      name: product.name,
      description: product.description,
      category: product.category,
      image_url: product.image_url,
      plans: plans.filter((plan: any) => plan.product_id === product.id).map((plan: any) => ({
        id: plan.id,
        name: plan.name,
        description: plan.description,
        price: plan.price,
        currency: plan.currency,
        duration_days: plan.duration_days,
        stock: plan.stock,
        quantity_discount_tiers: plan.quantity_discount_tiers || [],
      })),
    }));

    return json({
      ok: true,
      version: '2026-11-08',
      data,
      meta: { products: data.length, plans: plans.length, read_only: true },
    });
  } catch (error) {
    console.error('Developer catalog API failed:', error);
    return json({ error: 'CATALOG_UNAVAILABLE' }, 503);
  }
}
