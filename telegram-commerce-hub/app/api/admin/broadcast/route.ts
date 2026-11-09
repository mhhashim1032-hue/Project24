import { NextRequest, NextResponse } from "next/server";
import { invokeGoldFeatherServer } from "@/lib/server-bridge";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const result = await invokeGoldFeatherServer("admin_broadcast", body, { authorization: req.headers.get("authorization") || "", timeoutMs: 55000 });
  return NextResponse.json(result.data, { status: result.status, headers: { "Cache-Control": "no-store" } });
}
