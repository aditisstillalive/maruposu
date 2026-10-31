// Next.js data cache for reads that may lag a little (admin dashboards and
// reports), invalidated on every database write: queueSync() in replica-sync.ts
// is the single point every write goes through, and it calls revalidateData().
//
// Never cache what decides a sale (prices, stock, PIN, device sessions, anything
// apply/sync in src/lib/pos reads): those always come from the database.
import { revalidateTag, unstable_cache } from 'next/cache';

const TAG = 'maruposu-data';
const PREFIX = 'maruposu';

/**
 * A cached read: at most 5 minutes old, dropped on the next write.
 * The value is stored as JSON, so return plain data (no Date, Map or Set),
 * and keep keys stable (no random or per-request parts).
 */
export function cachedRead<T>(key: string, fn: () => Promise<T>): () => Promise<T> {
  return unstable_cache(fn, [PREFIX, key], { revalidate: 300, tags: [TAG] });
}

/**
 * Changes whenever anything is written (and at least hourly), without touching
 * the database: the POS snapshot answers "unchanged" while it stays the same,
 * so idle tablets let the Neon compute suspend.
 */
export const dataVersion = unstable_cache(async () => new Date().toISOString(), [PREFIX, 'data-version'], { revalidate: 3600, tags: [TAG] });

/** Drops every cached read. Safe outside a request (scripts, tests): then it does nothing. */
export function revalidateData(): void {
  try {
    revalidateTag(TAG);
  } catch {
    // no request/cache context (seed scripts, unit tests)
  }
}
