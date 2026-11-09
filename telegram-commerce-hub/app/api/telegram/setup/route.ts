import { NextRequest, NextResponse } from "next/server";
import { invokeGoldFeatherServer } from "@/lib/server-bridge";
export const runtime = "nodejs";
export const maxDuration = 30;
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const appUrl = String(body.appUrl || process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
  const result = await invokeGoldFeatherServer("admin_telegram_setup", { appUrl }, { authorization: req.headers.get("authorization") || "", setupSecret: req.headers.get("x-setup-secret") || "", timeoutMs: 25000 });
  return NextResponse.json(result.data, { status: result.status, headers: { "Cache-Control": "no-store" } });
}
