import { createHash, timingSafeEqual } from 'node:crypto';

/** Constant-time check of the tokoiboek ↔ maruposu bearer token; refuses all when it isn't set up properly. */
export function validSyncToken(header: string | null): boolean {
  const expected = process.env.VOUCHER_SYNC_TOKEN;
  if (!expected || expected.length < 24 || !header?.startsWith('Bearer ')) return false;
  const digest = (s: string) => createHash('sha256').update(s).digest();
  return timingSafeEqual(digest(header.slice(7)), digest(expected));
}
