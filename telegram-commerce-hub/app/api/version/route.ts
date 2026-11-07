export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({
    ok: true,
    service: "gold-feather-premium-commerce-os",
    gitCommit: process.env.RENDER_GIT_COMMIT ?? null,
    deployId: process.env.RENDER_DEPLOY_ID ?? null,
    timestamp: new Date().toISOString(),
  });
}
