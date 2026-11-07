import type { Metadata } from 'next';
export const metadata: Metadata = {
  title: 'Gold Feather Admin · Commerce Control',
  description: 'Private Gold Feather Premium administration workspace.',
  manifest: '/admin/manifest.webmanifest',
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: 'Gold Feather Admin', statusBarStyle: 'black-translucent' },
  themeColor: '#111318',
};
export default function AdminLayout({children}:{children:React.ReactNode}) { return children; }
