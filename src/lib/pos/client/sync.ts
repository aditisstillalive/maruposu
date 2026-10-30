import { db, getKV, setKV, type RejectedEntry, type SyncState } from './db';
import { setWriteListener } from './actions';
import type { Snapshot } from '../types';

const BATCH = 50;
const INTERVAL_MS = 15_000;

type Result = { id: string; status: 'applied' | 'duplicate' | 'rejected'; error?: string };

async function saveState(state: Omit<SyncState, 'pending' | 'rejected'>): Promise<SyncState> {
  const full: SyncState = {
    ...state,
    pending: await db.outbox.count(),
    rejected: ((await getKV('rejected')) ?? []).length,
  };
  await setKV('sync_state', full);
  return full;
}

/**
 * Replaces local data with the server's, except anything still waiting in the
 * outbox: the tablet's version of those is newer than the server's.
 */
export async function applySnapshot(snap: Snapshot): Promise<void> {
  await db.transaction('rw', [db.orders, db.cash_moves, db.outbox, db.kv], async () => {
    const pending = await db.outbox.toArray();
    const pendingRefs = new Set(pending.map(e => e.ref));
    const pendingMoves = new Set(
      pending.flatMap(e => (e.mutation.type === 'cash.move' ? [e.mutation.movement_id] : e.mutation.type === 'order.refund' ? [e.mutation.refund_id] : []))
    );

    await setKV('snapshot', snap);
    await setKV('device_tag', snap.device_tag);
    const local = await getKV('shift');
    if (!(local && pendingRefs.has(local.id))) await setKV('shift', snap.shift);

    const serverOrders = new Set(snap.orders.map(o => o.id));
    for (const o of snap.orders) if (!pendingRefs.has(o.id)) await db.orders.put(o);
    for (const o of await db.orders.toArray()) {
      if (!serverOrders.has(o.id) && !pendingRefs.has(o.id)) await db.orders.delete(o.id);
    }

    const serverMoves = new Set(snap.cash_moves.map(m => m.id));
    for (const m of snap.cash_moves) if (!pendingMoves.has(m.id)) await db.cash_moves.put(m);
    for (const m of await db.cash_moves.toArray()) {
      if (!serverMoves.has(m.id) && !pendingMoves.has(m.id)) await db.cash_moves.delete(m.id);
    }
  });
}

/** Pushes the outbox, then (if it emptied) pulls a fresh snapshot. */
export async function syncOnce(fetchImpl: typeof fetch = fetch): Promise<SyncState> {
  const last = (await getKV('sync_state'))?.last_synced_at ?? null;
  try {
    for (;;) {
      const batch = await db.outbox.orderBy('seq').limit(BATCH).toArray();
      if (!batch.length) break;
      const res = await fetchImpl('/api/pos/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mutations: batch.map(e => e.mutation) }),
      });
      if (res.status === 401) return saveState({ status: 'locked', last_synced_at: last });
      if (!res.ok) return saveState({ status: 'error', last_synced_at: last });

      const { results } = (await res.json()) as { results: Result[] };
      const byId = new Map(results.map(r => [r.id, r]));
      await db.transaction('rw', [db.outbox, db.kv], async () => {
        const rejected = (await getKV('rejected')) ?? [];
        for (const entry of batch) {
          const r = byId.get(entry.id);
          if (!r) continue; // not answered: stays queued
          if (r.status === 'rejected') {
            rejected.push({ id: entry.id, type: entry.mutation.type, error: r.error ?? 'Ditolak server', at: new Date().toISOString(), mutation: entry.mutation } satisfies RejectedEntry);
          }
          await db.outbox.delete(entry.seq!);
        }
        await setKV('rejected', rejected.slice(-50));
      });
      if (batch.some(e => !byId.has(e.id))) return saveState({ status: 'error', last_synced_at: last });
    }

    const res = await fetchImpl('/api/pos/snapshot', { cache: 'no-store' });
    if (res.status === 401) return saveState({ status: 'locked', last_synced_at: last });
    if (!res.ok) return saveState({ status: 'error', last_synced_at: last });
    await applySnapshot((await res.json()) as Snapshot);
    return saveState({ status: 'idle', last_synced_at: new Date().toISOString() });
  } catch {
    return saveState({ status: 'offline', last_synced_at: last });
  }
}

let running: Promise<SyncState> | null = null;
let again = false;

/** One sync at a time; a request while one runs schedules exactly one more. */
export function requestSync(): Promise<SyncState> {
  if (running) {
    again = true;
    return running;
  }
  running = syncOnce().finally(() => {
    running = null;
    if (again) {
      again = false;
      void requestSync();
    }
  });
  return running;
}

/** Background sync: now, every 15 s, when the network returns and after local writes. */
export function startSyncLoop(): () => void {
  let debounce: ReturnType<typeof setTimeout> | null = null;
  setWriteListener(() => {
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(() => void requestSync(), 300);
  });
  const onOnline = () => void requestSync();
  window.addEventListener('online', onOnline);
  const timer = setInterval(() => void requestSync(), INTERVAL_MS);
  void requestSync();
  return () => {
    setWriteListener(null);
    window.removeEventListener('online', onOnline);
    clearInterval(timer);
    if (debounce) clearTimeout(debounce);
  };
}
