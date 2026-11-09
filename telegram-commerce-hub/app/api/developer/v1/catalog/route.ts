import { NextRequest, NextResponse } from "next/server";
import { invokeGoldFeatherServer } from "@/lib/server-bridge";
export const runtime = "nodejs";
export const maxDuration = 20;
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Allow-Headers": "authorization, content-type", "Cache-Control": "private, max-age=15" };
export async function OPTIONS() { return new Response(null, { status: 204, headers: cors }); }
export async function GET(req: NextRequest) {
  const result = await invokeGoldFeatherServer("developer_catalog", {}, { authorization: req.headers.get("authorization") || "", timeoutMs: 18000 });
  return NextResponse.json(result.data, { status: result.status, headers: cors });
}
