import Dexie, { type Table } from 'dexie';
import type { Mutation } from '../mutations';
import type { CashMoveDoc, OrderDoc, ShiftDoc, Snapshot, SnapshotEmployee } from '../types';

/** A mutation waiting to reach the server. `ref` is the order/shift it touches. */
export type OutboxEntry = { seq?: number; id: string; ref: string; mutation: Mutation };

/** Kept in full so a rejected sale can still be looked up and redone by hand. */
export type RejectedEntry = { id: string; type: string; error: string; at: string; mutation: Mutation };

export type SyncState = {
  status: 'idle' | 'syncing' | 'offline' | 'locked' | 'error';
  pending: number;
  rejected: number;
  last_synced_at: string | null;
};

// Typed key/value slots in the `kv` table.
export type KV = {
  snapshot: Snapshot;
  shift: ShiftDoc | null;
  cashier: SnapshotEmployee | null;
  device_tag: string;
  rejected: RejectedEntry[];
  sync_state: SyncState;
  offline_pin: { salt: string; hash: string; pin_version: number; exp: number };
  offline_session: number; // epoch ms the PIN-on-tablet unlock lasts until
};

class PosDB extends Dexie {
  orders!: Table<OrderDoc, string>;
  cash_moves!: Table<CashMoveDoc, string>;
  outbox!: Table<OutboxEntry, number>;
  kv!: Table<{ key: string; value: unknown }, string>;

  constructor() {
    super('maruposu-pos');
    this.version(1).stores({
      orders: 'id, status, shift_id, business_date',
      cash_moves: 'id, shift_id',
      outbox: '++seq, &id, ref',
      kv: 'key',
    });
  }
}

export const db = new PosDB();

export async function getKV<K extends keyof KV>(key: K): Promise<KV[K] | undefined> {
  return (await db.kv.get(key))?.value as KV[K] | undefined;
}

export async function setKV<K extends keyof KV>(key: K, value: KV[K]): Promise<void> {
  await db.kv.put({ key, value });
}

/** Order sequence counters live in kv too, one per business day. */
export const seqKey = (businessDate: string) => `seq:${businessDate}`;
