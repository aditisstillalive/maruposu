// Café identity. The name shown to staff comes from Setting.cafe_name; this is the
// fallback for metadata and for pages rendered before the DB is reachable.
export const site = {
  name: 'Maraca Books & Coffee',
  product: 'maruposu',
  logo: '/maraca-logo.png', // full lockup (Maraca / Books & Coffee / Est. 2016)
  wordmark: '/maraca-wordmark.png', // just "Maraca", for small headers
  url: process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3200',
} as const;
