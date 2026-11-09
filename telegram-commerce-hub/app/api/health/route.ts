import { NextResponse } from "next/server";
import { invokeGoldFeatherServer } from "@/lib/server-bridge";
export const dynamic = "force-dynamic";
export async function GET() {
  const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "";
  const result = await invokeGoldFeatherServer("health", { appUrl }, { timeoutMs: 12000 });
  const checks = result.data?.checks || {};
  const ok = result.status === 200 && result.data?.ok === true;
  return NextResponse.json({
    ok, status: ok ? "ready" : "degraded",
    service: "gold-feather-premium-commerce-os",
    timestamp: new Date().toISOString(), checks,
    backend: "supabase_edge_function",
  }, { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
