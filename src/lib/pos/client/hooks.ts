'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { db, type KV, type SyncState } from './db';
import type { CashMoveDoc, OrderDoc } from '../types';

const IDLE: SyncState = { status: 'idle', pending: 0, rejected: 0, last_synced_at: null };

/** Live view of the tablet's local data; re-renders whenever Dexie changes. */
export function usePosState() {
  const kv = useLiveQuery(async () => Object.fromEntries((await db.kv.toArray()).map(r => [r.key, r.value])) as Partial<KV>, []);
  const shiftId = kv?.shift?.id ?? null;
  const orders = useLiveQuery(
    () => (shiftId ? db.orders.where('shift_id').equals(shiftId).sortBy('created_at') : Promise.resolve([] as OrderDoc[])),
    [shiftId]
  );
  // Live, so a fresh local write shows as unsynced before the next sync runs
  const pending = useLiveQuery(() => db.outbox.count(), []);
  const cashMoves = useLiveQuery(
    () => (shiftId ? db.cash_moves.where('shift_id').equals(shiftId).sortBy('created_at') : Promise.resolve([] as CashMoveDoc[])),
    [shiftId]
  );

  return {
    loading: kv === undefined,
    snapshot: kv?.snapshot ?? null,
    shift: kv?.shift ?? null,
    cashier: kv?.cashier ?? null,
    sync: { ...(kv?.sync_state ?? IDLE), pending: pending ?? kv?.sync_state?.pending ?? 0 },
    rejected: kv?.rejected ?? [],
    orders: orders ?? [],
    cashMoves: cashMoves ?? [],
  };
}
