import { NextRequest, NextResponse } from "next/server";
import { invokeGoldFeatherServer } from "@/lib/server-bridge";
export const runtime = "nodejs";
export const maxDuration = 20;
export async function POST(req: NextRequest) {
  const update = await req.json().catch(() => null);
  if (!update) return NextResponse.json({ ok: false, error: "INVALID_WEBHOOK_BODY" }, { status: 400 });
  const result = await invokeGoldFeatherServer("telegram_webhook", { update, appUrl: process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "", storeName: process.env.STORE_NAME || "GOLD FEATHER PREMIUM" }, { webhookSecret: req.headers.get("x-telegram-bot-api-secret-token") || "", timeoutMs: 18000 });
  return NextResponse.json(result.data, { status: result.status, headers: { "Cache-Control": "no-store" } });
}
