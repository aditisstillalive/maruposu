// Only allow same-site paths as post-login destinations, so a crafted
// ?callbackUrl= can't send an admin to another site after signing in.
export function safeCallbackUrl(url: string | null | undefined, fallback = '/admin/dashboard'): string {
  if (!url || !url.startsWith('/') || url.startsWith('//') || url.includes('\\')) return fallback;
  return url;
}
