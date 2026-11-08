import type { Metadata, Viewport } from 'next';
export const metadata: Metadata = {
  title: 'Gold Feather Admin · Commerce Control',
  description: 'Private Gold Feather Premium administration workspace.',
  manifest: '/admin/manifest.webmanifest',
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: 'Gold Feather Admin', statusBarStyle: 'black-translucent' },
  icons: { icon: '/admin-icon.svg', apple: '/admin-icon.svg' },
};
export const viewport: Viewport = { themeColor: '#171a20', width: 'device-width', initialScale: 1, viewportFit: 'cover' };
export default function AdminLayout({children}:{children:React.ReactNode}) { return children; }
