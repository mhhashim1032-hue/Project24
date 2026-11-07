import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'NOVA · Commerce Control', description: 'Telegram software and subscription commerce control center' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
