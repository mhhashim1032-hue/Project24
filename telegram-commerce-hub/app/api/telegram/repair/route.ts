import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { invokeGoldFeatherServer } from "@/lib/server-bridge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Temporary one-time recovery endpoint. Remove after webhook reconciliation.
export async function GET(req: NextRequest) {
  const supplied = req.nextUrl.searchParams.get("key") || "";
  const expected = process.env.TELEGRAM_REPAIR_ONCE_KEY || "";
  const matches = supplied.length === expected.length && expected.length >= 32 &&
    timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
  if (!matches) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const token = process.env.TELEGRAM_BOT_TOKEN || "";
  if (!token) return NextResponse.json({ error: "BOT_TOKEN_NOT_CONFIGURED" }, { status: 503 });
  const setupSecret = createHash("sha256").update(token + ":gold-feather-webhook-v1").digest("hex");
  const appUrl = String(process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
  if (!/^https:\/\//i.test(appUrl)) return NextResponse.json({ error: "APP_URL_NOT_CONFIGURED" }, { status: 503 });

  const result = await invokeGoldFeatherServer("admin_telegram_setup", { appUrl }, { setupSecret, timeoutMs: 25000 });
  return NextResponse.json({ ...result.data, status: result.status }, {
    status: result.status,
    headers: { "Cache-Control": "no-store" },
  });
}
