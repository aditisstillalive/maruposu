// Page views go to Vercel Web Analytics; the table QR token (it unlocks ordering
// for that table) and order ids never leave as part of a URL.

/** The URL as analytics should record it. */
export function maskUrl(url: string): string {
  const u = new URL(url);
  const m = u.pathname.match(/^\/t\/[^/]+(\/o\/[^/]+)?\/?$/);
  if (!m) return url;
  return `${u.origin}/t/[meja]${m[1] ? '/o/[pesanan]' : ''}`;
}
