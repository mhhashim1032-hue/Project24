import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createHmac } from 'node:crypto';
export const runtime = 'nodejs';

function decimalEqual(a: unknown, b: unknown) {
  const left = Number(a), right = Number(b);
  return Number.isFinite(left) && Number.isFinite(right) && left > 0 && Math.abs(left - right) < 0.00000001;
}

export async function POST(req: NextRequest) {
  try {
    const token = (req.headers.get('authorization') || '').replace(/^Bearer\\s+/i, '');
    if (!token) return NextResponse.json({ status: 'error', message: 'Sign in to verify this order.' }, { status: 401 });
    const apiKey = process.env.BINANCE_API_KEY;
    const apiSecret = process.env.BINANCE_API_SECRET;
    const verifySecret = process.env.PAYMENT_VERIFY_SECRET;
    if (!apiKey || !apiSecret || !verifySecret) {
      return NextResponse.json({ status: 'manual_review_required', message: 'Automatic verification is not configured yet. Your reference is safely queued for administrator review.' });
    }
    const body = await req.json();
    const paymentId = String(body.paymentId || '');
    if (!/^[0-9a-f-]{36}$/i.test(paymentId)) return NextResponse.json({ status: 'error', message: 'Invalid payment submission.' }, { status: 400 });

    const supabase = createClient(
      'https://ckresrujdienuqczzyki.supabase.co',
      'sb_publishable_DF1KAMN_dssbRpWxWuBLIw_VdH_Jndm',
      { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } }
    );
    const { data: authData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !authData.user) return NextResponse.json({ status: 'error', message: 'Your session has expired. Sign in again.' }, { status: 401 });

    const { data: payment, error: paymentError } = await supabase.from('payment_submissions')
      .select('id,order_id,transaction_reference,status').eq('id', paymentId).single();
    if (paymentError || !payment) return NextResponse.json({ status: 'error', message: 'Payment submission not found for this account.' }, { status: 404 });
    if (payment.status === 'verified') return NextResponse.json({ status: 'verified', message: 'Payment is already verified.' });
    if (payment.status !== 'submitted') return NextResponse.json({ status: 'error', message: 'This payment submission is no longer pending.' }, { status: 409 });

    const { data: order, error: orderError } = await supabase.from('orders')
      .select('id,amount,currency,status,expires_at').eq('id', payment.order_id).single();
    if (orderError || !order) return NextResponse.json({ status: 'error', message: 'Order not found.' }, { status: 404 });
    if (order.status !== 'awaiting_payment') return NextResponse.json({ status: 'error', message: 'This order is not awaiting payment.' }, { status: 409 });
    const { data: settings } = await supabase.from('bot_settings').select('binance_pay_id').eq('id', 1).maybeSingle();
    if (!settings?.binance_pay_id) return NextResponse.json({ status: 'manual_review_required', message: 'The store owner has not configured the receiving Binance Pay ID.' });

    const now = Date.now();
    const { data: slot, error: slotError } = await supabase.rpc('claim_binance_verification_slot', { p_secret: verifySecret });
    if (slotError) return NextResponse.json({ status: 'error', message: 'Verification service is temporarily unavailable.' }, { status: 503 });
    if (slot !== true) return NextResponse.json({ status: 'rate_limited', message: 'Binance Pay history is checked at a controlled interval to respect Binance account limits. Please retry in about one minute.' }, { status: 429 });

    const params = new URLSearchParams({
      timestamp: String(now),
      startTime: String(now - 24 * 60 * 60 * 1000),
      endTime: String(now),
      limit: '100',
      recvWindow: '5000',
    });
    const signature = createHmac('sha256', apiSecret).update(params.toString()).digest('hex');
    const response = await fetch(`https://api.binance.com/sapi/v1/pay/transactions?${params.toString()}&signature=${signature}`, {
      method: 'GET',
      headers: { 'X-MBX-APIKEY': apiKey },
      signal: AbortSignal.timeout(12000),
      cache: 'no-store',
    });
    const result = await response.json();
    if (!response.ok || result?.success !== true || !Array.isArray(result?.data)) {
      return NextResponse.json({ status: 'error', message: 'Binance could not return Pay history. Check the read-only API key permissions and try again later.' }, { status: 502 });
    }

    const tx = result.data.find((item: any) => String(item.transactionId || '') === payment.transaction_reference);
    if (!tx) return NextResponse.json({ status: 'pending', message: 'This transaction is not visible in Binance Pay history yet. It may take a short time to appear; retry later or wait for administrator review.' });
    const receiverPayId = String(tx.receiverInfo?.accountId || '');
    const incoming = Number(tx.amount) > 0;
    const sameReceiver = receiverPayId === String(settings.binance_pay_id).trim();
    const sameAmount = decimalEqual(tx.amount, order.amount);
    const sameCurrency = String(tx.currency || '') === String(order.currency || '');
    if (!incoming || !sameReceiver || !sameAmount || !sameCurrency) {
      return NextResponse.json({ status: 'mismatch', message: 'A transaction with that reference was found, but the recipient, amount, currency or direction does not match this order. It has not been approved.' });
    }

    const verifiedPayload = {
      transactionId: String(tx.transactionId),
      amount: String(tx.amount),
      currency: String(tx.currency),
      receiverPayId,
      income: incoming,
      transactionTime: Number(tx.transactionTime || 0),
      orderType: String(tx.orderType || ''),
      payerBinanceId: String(tx.payerInfo?.binanceId || ''),
    };
    const { data: confirmation, error: confirmationError } = await supabase.rpc('confirm_binance_payment', {
      p_secret: verifySecret,
      p_payment_id: payment.id,
      p_payload: verifiedPayload,
    });
    if (confirmationError) return NextResponse.json({ status: 'error', message: 'The payment matched Binance history but could not be committed. Contact the store administrator.' }, { status: 500 });
    return NextResponse.json({ status: confirmation?.status || 'verified', message: confirmation?.status === 'fulfilled' ? 'Payment verified and your digital product has been delivered.' : 'Payment verified successfully. Your order is confirmed.' });
  } catch (error) {
    return NextResponse.json({ status: 'error', message: 'Verification request failed. Please retry later or contact support.' }, { status: 500 });
  }
}
