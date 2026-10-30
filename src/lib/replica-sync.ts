// One-way sync primary -> replica. Rows are copied with their original ids and every
// column, so both databases hold identical data.
//
// After each write the app queues a targeted sync of what changed. If the replica
// can't take it (quota, network), the replica is marked dirty: it stops serving reads
// until a full sync succeeds (admin "Sync now", daily cron, or an automatic retry).
import { after } from 'next/server';
import { Prisma, type PrismaClient } from '@prisma/client';
import { prisma, replica } from '@/lib/prisma';
import { SYNC_STATE_ID, invalidateSyncCache, isUnavailableError, markDown } from '@/lib/db-router';

export type SyncTask =
  | { adminUser: string }
  | { setting: string }
  | { employee: string }
  | { category: string }
  | { product: string }
  | { optionGroup: string }
  | { auditLog: string }
  | { promo: string }
  | { shift: string }
  | { orders: string[] };

// Every synced table, parents before children. PinThrottle and SyncState stay on
// the primary only.
export const SYNCED_TABLES = [
  'adminUser', 'outlet', 'setting', 'employee', 'category', 'optionGroup',
  'option', 'product', 'productOptionGroup', 'promo', 'shift', 'order',
  'orderItem', 'orderItemOption', 'refund', 'refundItem', 'cashMovement', 'auditLog',
] as const;
const TABLES = SYNCED_TABLES;
type Table = (typeof TABLES)[number];
type Row = { id: string } & Record<string, unknown>;
type Tx = Prisma.TransactionClient;
type Apply = (tx: Tx) => Promise<void>;

const CATCH_UP_INTERVAL_MS = 15 * 60 * 1000;

// Prisma delegates share these method shapes; the generic typing doesn't express that.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function table(db: PrismaClient | Tx, name: Table): any {
  return (db as unknown as Record<Table, unknown>)[name];
}

// Nullable Json columns. A SQL NULL reads back as `null`, but Prisma writes a plain
// `null` as the JSON value null, so it must be passed as DbNull to stay NULL.
const JSON_COLUMNS: Partial<Record<Table, string[]>> = { auditLog: ['detail'] };

export function forWrite(name: Table, row: Row): Row {
  const cols = JSON_COLUMNS[name];
  if (!cols) return row;
  const out: Row = { ...row };
  for (const col of cols) if (out[col] === null) out[col] = Prisma.DbNull;
  return out;
}

async function upsertRows(tx: Tx, name: Table, rows: Row[]) {
  for (const raw of rows) {
    const row = forWrite(name, raw);
    await table(tx, name).upsert({ where: { id: row.id }, create: row, update: row });
  }
}

// Makes the replica's rows matching `where` exactly equal to `rows`.
async function mirror(tx: Tx, name: Table, where: object, rows: Row[]) {
  await table(tx, name).deleteMany({ where: { AND: [where, { id: { notIn: rows.map(r => r.id) } }] } });
  await upsertRows(tx, name, rows);
}

// Reads what a task needs from the primary and returns the replica-side write.
async function load(task: SyncTask): Promise<Apply> {
  if ('product' in task) {
    const id = task.product;
    const [product, links] = await Promise.all([
      prisma.product.findUnique({ where: { id } }),
      prisma.productOptionGroup.findMany({ where: { product_id: id } }),
    ]);
    return async tx => {
      if (!product) {
        await tx.product.deleteMany({ where: { id } }); // cascades like the primary did
        return;
      }
      await upsertRows(tx, 'product', [product]);
      await mirror(tx, 'productOptionGroup', { product_id: id }, links);
    };
  }
  if ('optionGroup' in task) {
    const id = task.optionGroup;
    const [group, options, links] = await Promise.all([
      prisma.optionGroup.findUnique({ where: { id } }),
      prisma.option.findMany({ where: { group_id: id } }),
      prisma.productOptionGroup.findMany({ where: { group_id: id } }),
    ]);
    return async tx => {
      if (!group) {
        await tx.optionGroup.deleteMany({ where: { id } });
        return;
      }
      await upsertRows(tx, 'optionGroup', [group]);
      await mirror(tx, 'option', { group_id: id }, options);
      await mirror(tx, 'productOptionGroup', { group_id: id }, links);
    };
  }
  if ('shift' in task) {
    const id = task.shift;
    const [shift, moves] = await Promise.all([
      prisma.shift.findUnique({ where: { id } }),
      prisma.cashMovement.findMany({ where: { shift_id: id, refund_id: null } }),
    ]);
    return async tx => {
      if (!shift) return;
      await upsertRows(tx, 'shift', [shift]);
      await mirror(tx, 'cashMovement', { shift_id: id, refund_id: null }, moves);
    };
  }
  if ('orders' in task) {
    const ids = task.orders;
    const orders = await prisma.order.findMany({ where: { id: { in: ids } } });
    const [shifts, items, options, refunds, refundItems, refundMoves] = await Promise.all([
      prisma.shift.findMany({ where: { id: { in: [...new Set(orders.map(o => o.shift_id))] } } }),
      prisma.orderItem.findMany({ where: { order_id: { in: ids } } }),
      prisma.orderItemOption.findMany({ where: { item: { order_id: { in: ids } } } }),
      prisma.refund.findMany({ where: { order_id: { in: ids } } }),
      prisma.refundItem.findMany({ where: { refund: { order_id: { in: ids } } } }),
      prisma.cashMovement.findMany({ where: { refund: { order_id: { in: ids } } } }),
    ]);
    // Refunds can land in a later shift than the order's
    const refundShifts = await prisma.shift.findMany({
      where: { id: { in: [...new Set(refunds.map(r => r.shift_id))].filter(s => !shifts.some(x => x.id === s)) } },
    });
    return async tx => {
      await upsertRows(tx, 'shift', [...shifts, ...refundShifts]);
      await mirror(tx, 'order', { id: { in: ids } }, orders);
      await mirror(tx, 'orderItem', { order_id: { in: ids } }, items);
      await mirror(tx, 'orderItemOption', { item: { order_id: { in: ids } } }, options);
      await mirror(tx, 'refund', { order_id: { in: ids } }, refunds);
      await mirror(tx, 'refundItem', { refund: { order_id: { in: ids } } }, refundItems);
      await mirror(tx, 'cashMovement', { refund: { order_id: { in: ids } } }, refundMoves);
    };
  }
  if ('setting' in task) {
    const setting = await prisma.setting.findUnique({ where: { id: task.setting }, include: { outlet: true } });
    return async tx => {
      if (!setting) return;
      const { outlet, ...row } = setting;
      await upsertRows(tx, 'outlet', [outlet]);
      await upsertRows(tx, 'setting', [row]);
    };
  }
  const [name, id]: [Table, string] =
    'adminUser' in task ? ['adminUser', task.adminUser]
    : 'employee' in task ? ['employee', task.employee]
    : 'category' in task ? ['category', task.category]
    : 'promo' in task ? ['promo', task.promo]
    : ['auditLog', task.auditLog];
  const row: Row | null = await table(prisma, name).findUnique({ where: { id } });
  return tx => mirror(tx, name, { id }, row ? [row] : []);
}

async function markDirty(error?: unknown) {
  const now = new Date();
  const fields = { dirty: true, changed_at: now, ...(error ? { last_error: String((error as Error)?.message ?? error).slice(0, 500) } : {}) };
  await prisma.syncState.upsert({ where: { id: SYNC_STATE_ID }, create: { id: SYNC_STATE_ID, ...fields }, update: fields });
  invalidateSyncCache();
}

async function runSync(tasks: SyncTask[]) {
  if (!replica) return;
  try {
    const state = await prisma.syncState.findUnique({ where: { id: SYNC_STATE_ID } });
    if (!state || state.dirty) {
      // Replica is already behind; only a full sync can bring it back
      await markDirty();
      await catchUp();
      return;
    }
    const applies = await Promise.all(tasks.map(load));
    await replica.$transaction(async tx => {
      for (const apply of applies) await apply(tx);
    }, { timeout: 30_000 });
  } catch (error) {
    console.error('Replica sync failed; replica marked out of sync:', error);
    if (isUnavailableError(error)) markDown(replica, error);
    await markDirty(error).catch(e => console.error('Could not record replica sync state:', e));
  }
}

const pending = new Set<Promise<unknown>>();

export function runLater(fn: () => Promise<unknown>) {
  try {
    after(fn); // after the response is sent (waitUntil on Vercel)
  } catch {
    // Outside a request (scripts, tests): run detached
    const p = fn().finally(() => pending.delete(p));
    pending.add(p);
  }
}

/** Copies the given changes from the primary to the replica after the response. */
export function queueSync(...tasks: SyncTask[]) {
  if (!replica || tasks.length === 0) return;
  runLater(() => runSync(tasks));
}

/** Waits for detached syncs started outside a request (scripts and tests). */
export async function waitForSync() {
  while (pending.size) await Promise.all(pending);
}

export type FullSyncResult = { ok: true; rows: number; inSync: boolean } | { ok: false; error: string };

let running: Promise<FullSyncResult> | null = null;

/** Replaces all synced tables on the replica with the primary's data. */
export function fullSync(): Promise<FullSyncResult> {
  // A change landing mid-copy leaves it dirty; one more pass picks that up
  running ??= runFullSync()
    .then(r => (r.ok && !r.inSync ? runFullSync() : r))
    .finally(() => { running = null; });
  return running;
}

async function runFullSync(): Promise<FullSyncResult> {
  if (!replica) return { ok: false, error: 'DATABASE_URL_REPLICA is not set' };
  const started = new Date();
  try {
    // Probe the replica first so a dead replica costs no primary egress
    await replica.$queryRaw`SELECT 1`;

    const data = {} as Record<Table, Row[]>;
    for (const name of TABLES) data[name] = await table(prisma, name).findMany();

    await replica.$transaction(async tx => {
      for (const name of [...TABLES].reverse()) await table(tx, name).deleteMany();
      for (const name of TABLES) {
        if (data[name].length) await table(tx, name).createMany({ data: data[name].map(r => forWrite(name, r)) });
      }
    }, { timeout: 120_000, maxWait: 20_000 });

    // In sync only if no change was missed while we were copying
    await prisma.syncState.upsert({ where: { id: SYNC_STATE_ID }, create: { id: SYNC_STATE_ID }, update: {} });
    const { count } = await prisma.syncState.updateMany({
      where: { id: SYNC_STATE_ID, OR: [{ changed_at: null }, { changed_at: { lt: started } }] },
      data: { dirty: false, last_synced_at: new Date(), last_error: null },
    });
    invalidateSyncCache();
    return { ok: true, rows: TABLES.reduce((n, t) => n + data[t].length, 0), inSync: count === 1 };
  } catch (error) {
    console.error('Replica full sync failed:', error);
    if (isUnavailableError(error)) markDown(replica, error);
    await markDirty(error).catch(e => console.error('Could not record replica sync state:', e));
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

let lastCatchUp = 0;

// Full sync when the replica is behind, at most once per interval per instance.
async function catchUp() {
  if (Date.now() - lastCatchUp < CATCH_UP_INTERVAL_MS) return;
  lastCatchUp = Date.now();
  const state = await prisma.syncState.findUnique({ where: { id: SYNC_STATE_ID } });
  if (!state || state.dirty) await fullSync();
}

/** Called on admin page loads: retries a pending full sync in the background. */
export function scheduleCatchUp() {
  if (!replica || Date.now() - lastCatchUp < CATCH_UP_INTERVAL_MS) return;
  runLater(() => catchUp().catch(e => console.error('Replica catch-up failed:', e)));
}

export async function getReplicaStatus() {
  const state = await prisma.syncState.findUnique({ where: { id: SYNC_STATE_ID } });
  return {
    configured: !!replica,
    inSync: !!state && !state.dirty,
    lastSyncedAt: state?.last_synced_at ?? null,
    lastError: state?.last_error ?? null,
  };
}
