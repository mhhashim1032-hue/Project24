export async function GET() {
  const manifest = {
    id: '/admin',
    name: 'Gold Feather Premium Admin',
    short_name: 'Gold Feather',
    description: 'Private commerce operations dashboard',
    start_url: '/admin',
    scope: '/admin',
    display: 'standalone',
    background_color: '#101116',
    theme_color: '#111318',
    orientation: 'any',
    icons: [{ src: '/admin-icon.svg', sizes: '192x192', type: 'image/svg+xml', purpose: 'any' }, { src: '/admin-icon.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'maskable' }]
  };
  return Response.json(manifest, {
    headers: {
      'Content-Type': 'application/manifest+json',
      'Cache-Control': 'public, max-age=3600'
    }
  });
}
