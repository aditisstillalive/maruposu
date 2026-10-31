import type { SyncState } from './db';

export type SyncStatus = { tone: 'ok' | 'warn' | 'muted'; icon: 'check' | 'spin' | 'offline' | 'alert' | 'key'; text: string };

/** Sales waiting longer than this get a warning with the last good sync time. */
const STALE_MS = 30 * 60_000;
const timeWIB = (iso: string) => new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });

/** What the top bar shows about syncing. */
export function syncStatus(sync: SyncState, online: boolean, now: Date): SyncStatus {
  const stale = sync.pending > 0 && (!sync.last_synced_at || now.getTime() - new Date(sync.last_synced_at).getTime() > STALE_MS);
  const pending = sync.pending > 0 ? `${sync.pending} belum tersinkron${stale && sync.last_synced_at ? ` · terakhir ${timeWIB(sync.last_synced_at)}` : ''}` : null;
  if (sync.status === 'locked') return { tone: 'warn', icon: 'key', text: 'Perlu PIN untuk sinkron' };
  if (!online || sync.status === 'offline') return { tone: 'warn', icon: 'offline', text: `Offline${pending ? ` · ${pending}` : ''}` };
  if (sync.status === 'error') return { tone: 'warn', icon: 'alert', text: `Gagal sinkron${pending ? ` · ${pending}` : ''}` };
  if (pending) return stale ? { tone: 'warn', icon: 'alert', text: pending } : { tone: 'muted', icon: 'spin', text: pending };
  return { tone: 'ok', icon: 'check', text: 'Tersinkron' };
}
