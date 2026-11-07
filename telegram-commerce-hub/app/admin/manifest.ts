import type { MetadataRoute } from 'next';
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/admin',
    name: 'Gold Feather Premium Admin',
    short_name: 'Gold Feather',
    description: 'Private commerce operations dashboard',
    start_url: '/admin',
    scope: '/admin/',
    display: 'standalone',
    background_color: '#101116',
    theme_color: '#111318',
    orientation: 'any',
    icons: [{ src: '/admin-icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
  };
}
