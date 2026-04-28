import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";
import { getTenantConfig } from "@/lib/tenant/config";
import { TenantProvider } from "@/lib/tenant/context";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SiteLogix",
  description: "Voice-first daily reporting for construction field managers",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "SiteLogix",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#111111",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const h = await headers();
  const tenantSlug = h.get("x-tenant-slug") || "parkway";
  const tenant = getTenantConfig(tenantSlug);

  // Fallback tenant for safety (fail-closed: use parkway defaults)
  const activeTenant = tenant || getTenantConfig("parkway")!;

  return (
    <html
      lang="en"
      style={{
        // @ts-expect-error CSS custom properties
        "--brand-primary": activeTenant.primaryColor,
        "--brand-accent": activeTenant.accentColor,
      }}
    >
      <head>
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="SiteLogix" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <TenantProvider tenant={activeTenant}>
          {children}
        </TenantProvider>
      </body>
    </html>
  );
}
