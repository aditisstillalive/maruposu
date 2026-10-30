// Images must live in Cloudflare R2; the DB (Neon) only stores their public URL.
// R2_PUBLIC_URL is the current public base (e.g. a custom domain). When moving
// domains, list the old bases in R2_LEGACY_PUBLIC_URLS (comma-separated) so
// already-stored URLs stay valid.
export function r2PublicBases(): string[] {
  return [process.env.R2_PUBLIC_URL, ...(process.env.R2_LEGACY_PUBLIC_URLS ?? '').split(',')]
    .map(b => b?.trim().replace(/\/$/, ''))
    .filter((b): b is string => !!b);
}

export function isR2Url(url: string): boolean {
  return r2PublicBases().some(base => url.startsWith(`${base}/`));
}
