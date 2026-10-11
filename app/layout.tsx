import type { Metadata, Viewport } from "next";
import { Manrope, Sora } from "next/font/google";
import { connection } from "next/server";

import { ServiceWorker } from "@/components/layout/service-worker";

import "./globals.css";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const sora = Sora({
  variable: "--font-sora",
  subsets: ["latin"],
  weight: ["600", "700"],
});

export const metadata: Metadata = {
  title: { default: "WeKonnectz", template: "%s · WeKonnectz" },
  description: "Verified adults in Liberia. Something serious or something easy — on your terms.",
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: "WeKonnectz", statusBarStyle: "black-translucent" },
  icons: { apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: "#0D0D11",
  colorScheme: "dark",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Every page renders per request so it carries that request's CSP nonce (§22; see proxy.ts).
  await connection();
  return (
    <html lang="en" className={`${manrope.variable} ${sora.variable} h-full`}>
      <body className="flex min-h-full flex-col bg-background text-foreground">
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
