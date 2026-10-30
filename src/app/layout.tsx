import type { Metadata, Viewport } from "next";
import { Raleway } from "next/font/google";
import { site } from "@/lib/site";
import "./globals.css";

const raleway = Raleway({
  variable: "--font-raleway",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: { default: site.name, template: `%s | ${site.name}` },
  description: `POS ${site.name}`,
  robots: { index: false, follow: false },
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Maraca POS", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1,
  // POS tablets: no accidental pinch-zoom while tapping fast
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" className={`${raleway.variable} h-full antialiased`}>
      <body suppressHydrationWarning className="h-full flex flex-col bg-white text-black">
        {children}
      </body>
    </html>
  );
}
