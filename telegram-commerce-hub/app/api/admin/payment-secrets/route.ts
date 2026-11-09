import { NextRequest, NextResponse } from "next/server";
import { invokeGoldFeatherServer } from "@/lib/server-bridge";
export const runtime = "nodejs";
export const maxDuration = 20;
export async function GET(req: NextRequest) {
  const result = await invokeGoldFeatherServer("admin_get_payment_secrets", {}, { authorization: req.headers.get("authorization") || "" });
  return NextResponse.json(result.data, { status: result.status, headers: { "Cache-Control": "no-store" } });
}
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const result = await invokeGoldFeatherServer("admin_set_payment_secrets", body, { authorization: req.headers.get("authorization") || "" });
  return NextResponse.json(result.data, { status: result.status, headers: { "Cache-Control": "no-store" } });
}
