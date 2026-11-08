export async function GET() {
  const manifest = {
    id: '/admin',
    name: 'Gold Feather Premium · Admin',
    short_name: 'Gold Feather',
    description: 'Secure premium commerce command centre for Gold Feather.',
    start_url: '/admin',
    scope: '/admin',
    display: 'standalone',
    display_override: ['standalone', 'minimal-ui'],
    categories: ['business', 'productivity'],
    background_color: '#f6f5f1',
    theme_color: '#171a20',
    orientation: 'any',
    icons: [{ src: '/admin-icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' }, { src: '/admin-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' }, { src: '/admin-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }, { src: '/admin-icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }]
  };
  return Response.json(manifest, {
    headers: {
      'Content-Type': 'application/manifest+json',
      'Cache-Control': 'public, max-age=3600'
    }
  });
}
