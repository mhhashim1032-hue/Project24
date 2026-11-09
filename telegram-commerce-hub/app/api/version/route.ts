export const dynamic = 'force-dynamic';

export async function GET() {
  const commit =
    process.env.VERCEL_GIT_COMMIT_SHA ??
    process.env.RENDER_GIT_COMMIT ??
    null;
  const deploymentId =
    process.env.VERCEL_DEPLOYMENT_ID ??
    process.env.RENDER_DEPLOY_ID ??
    null;
  const deploymentUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : null;

  return Response.json({
    ok: true,
    service: 'gold-feather-premium-commerce-os',
    gitCommit: commit,
    deployId: deploymentId,
    deploymentUrl,
    platform: process.env.VERCEL ? 'vercel' : process.env.RENDER ? 'render' : 'unknown',
    timestamp: new Date().toISOString(),
  }, { headers: { 'Cache-Control': 'no-store' } });
}
