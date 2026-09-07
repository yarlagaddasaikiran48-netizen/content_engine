import type { Metadata, Viewport } from "next";

import { BottomNav } from "@/components/BottomNav";
import "./globals.css";

export const metadata: Metadata = {
  title: "Spiritual Content Engine",
  description:
    "Approval queue for automatically generated Indian spiritual YouTube Shorts.",
  // Lets the dashboard be added to an iPhone home screen and open chromeless.
  appleWebApp: {
    capable: true,
    title: "Spiritual Engine",
    statusBarStyle: "default",
  },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Pinch-zoom stays available: disabling it is an accessibility failure.
  maximumScale: 5,
  // Lets content sit under the notch so the sticky bar can use the safe area.
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf7f2" },
    { media: "(prefers-color-scheme: dark)", color: "#0c0a09" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        {children}
        <BottomNav />
      </body>
    </html>
  );
}
