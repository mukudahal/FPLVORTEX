import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { readPublicSiteUrl } from "@/lib/runtimeConfig";
import { BottomNav } from "@/components/BottomNav";
import { SocialFooter } from "@/components/Logo";
import { PageFrame, TopBar } from "@/components/TopBar";

// Runs before first paint so the saved sun/moon choice never flashes the wrong colours.
const THEME_INIT = `(function(){try{var q=location.search.match(/[?&]theme=(light|dark)/);if(q){localStorage.setItem('vortex-theme',q[1]);}var t=localStorage.getItem('vortex-theme');document.documentElement.dataset.theme=t==='light'?'light':'dark';}catch(e){document.documentElement.dataset.theme='dark';}})();`;

const SITE_URL = readPublicSiteUrl();

const DESCRIPTION =
  "FPL Vortex — Live Fantasy Premier League analytics, MILP transfer & chip optimizer, live points, fixtures, price watch and squad planner.";

// Original Vortex PRO icon and social artwork shipped in public/.
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "FPL Vortex",
    template: "%s · FPL Vortex",
  },
  description: DESCRIPTION,
  applicationName: "FPL Vortex",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "FPL Vortex",
  },
  icons: {
    icon: [
      { url: "/favicon-32.png", type: "image/png", sizes: "32x32" },
      { url: "/favicon.png", type: "image/png", sizes: "64x64" },
      { url: "/icons/icon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/icons/icon-512.png", type: "image/png", sizes: "512x512" },
    ],
    shortcut: "/favicon.png",
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  openGraph: {
    title: "FPL Vortex",
    description: DESCRIPTION,
    siteName: "FPL Vortex",
    type: "website",
    url: SITE_URL,
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "FPL Vortex" }],
  },
  twitter: {
    card: "summary_large_image",
    site: "@FPLVORTEXM",
    title: "FPL Vortex",
    description: DESCRIPTION,
    images: ["/og-image.png"],
  },
};

export const viewport: Viewport = {
  themeColor: "#000000",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      </head>
      <body className="antialiased">
        <TopBar />
        <PageFrame>
          {children}
          <div className="px-3">
            <SocialFooter />
          </div>
        </PageFrame>
        <BottomNav />
      </body>
    </html>
  );
}
