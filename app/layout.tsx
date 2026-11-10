import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import "./verifier-live.css";

export const metadata: Metadata = {
  title: "Gold Feather Premium · Digital Storefront",
  description: "Gold Feather Premium — premium digital storefront and secure Telegram commerce.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body>
        <Script src="https://telegram.org/js/telegram-web-app.js?64" strategy="beforeInteractive" />
        {children}
      </body>
    </html>
  );
}
