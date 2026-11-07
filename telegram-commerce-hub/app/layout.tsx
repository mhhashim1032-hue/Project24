import type { Metadata } from 'next';
import Script from 'next/script';
import './globals.css';
export const metadata: Metadata = { title: 'Gold Feather Premium · Commerce OS', description: 'Gold Feather Premium digital store and automated Binance payment verification' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body><Script src="https://telegram.org/js/telegram-web-app.js?64" strategy="beforeInteractive"/>{children}</body></html>; }
