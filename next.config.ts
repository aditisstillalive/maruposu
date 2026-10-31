import type { NextConfig } from "next";
import { r2PublicBases } from "./src/lib/image-url";

const isDev = process.env.NODE_ENV !== "production";

// Next.js injects inline scripts for hydration, so script-src needs 'unsafe-inline'
// unless nonces are wired up. connect-src allows the browser's presigned PUT to R2.
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.r2.cloudflarestorage.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  poweredByHeader: false,
  env: {
    // Versions the POS service worker's caches (see public/sw.js)
    NEXT_PUBLIC_BUILD_ID: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) || String(Date.now()),
  },
  images: {
    // Allow next/image to load product/employee photos from R2.
    remotePatterns: r2PublicBases().map(base => new URL(`${base}/**`)),
    // Each image x width x quality is a billed transformation (team Hobby quota:
    // 5,000/month). Upload keys are unique (timestamp-random), so a URL's content
    // never changes: keep transformed images for 31 days instead of a few hours.
    minimumCacheTTL: 2678400,
    // Few widths and one quality, so every photo has only a handful of variants.
    deviceSizes: [640, 828, 1080, 1600],
    imageSizes: [96, 256, 384],
    qualities: [75],
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Browsers must always check for a new worker
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }] },
    ];
  },
};

export default nextConfig;
