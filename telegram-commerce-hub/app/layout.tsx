import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'Gold Feather Premium · Commerce OS', description: 'Gold Feather Premium digital store and automated Binance payment verification' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
