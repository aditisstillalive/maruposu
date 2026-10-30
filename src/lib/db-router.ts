// Routes staleness-tolerant POS reads (staff list, menu) round-robin across the primary and the replica,
// skipping a database that is over its Neon quota or unreachable.
import { Prisma, type PrismaClient } from '@prisma/client';
import { prisma, replica } from '@/lib/prisma';

export const SYNC_STATE_ID = 'replica';

const QUOTA_COOLDOWN_MS = 30 * 60 * 1000;
const CONNECTION_COOLDOWN_MS = 60 * 1000;
const SYNC_STATE_TTL_MS = 30 * 1000;

const UNAVAILABLE_CODES = new Set(['P1001', 'P1002', 'P1008', 'P1017', 'P2024']);
// Neon: "Your account or project has exceeded the quota. Upgrade your plan to increase limits."
const QUOTA_RE = /exceeded the (data transfer )?quota|quota exceeded/i;
const CONNECTION_RE = /can't reach database|connection (refused|reset|terminated|closed)|terminating connection|too many connections|timed out/i;

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function isQuotaError(e: unknown): boolean {
  return QUOTA_RE.test(errorText(e));
}

/** True when the database itself is unusable (quota, network), not when the query is bad. */
export function isUnavailableError(e: unknown): boolean {
  if (e instanceof Prisma.PrismaClientInitializationError) return true;
  const code = (e as { code?: string })?.code;
  if (code && UNAVAILABLE_CODES.has(code)) return true;
  return isQuotaError(e) || CONNECTION_RE.test(errorText(e));
}

export const DB_UNAVAILABLE_MESSAGE = 'Database sedang tidak tersedia. Coba lagi beberapa saat lagi.';

// In-memory per server instance: good enough to stop hammering a dead database.
const downUntil = new Map<PrismaClient, number>();

export function markDown(db: PrismaClient, e: unknown) {
  downUntil.set(db, Date.now() + (isQuotaError(e) ? QUOTA_COOLDOWN_MS : CONNECTION_COOLDOWN_MS));
  console.warn(`${db === prisma ? 'Primary' : 'Replica'} database unavailable, skipping it for now:`, errorText(e));
}

export function isUp(db: PrismaClient): boolean {
  return (downUntil.get(db) ?? 0) <= Date.now();
}

let syncCache: { inSync: boolean; at: number } | null = null;

export function invalidateSyncCache() {
  syncCache = null;
}

// The replica may only serve reads after a successful full sync with no missed changes since.
async function replicaInSync(): Promise<boolean> {
  if (syncCache && Date.now() - syncCache.at < SYNC_STATE_TTL_MS) return syncCache.inSync;
  let inSync: boolean;
  if (!isUp(prisma)) {
    inSync = true; // primary is down: stale data beats a blank POS
  } else {
    try {
      const state = await prisma.syncState.findUnique({ where: { id: SYNC_STATE_ID } });
      inSync = !!state && !state.dirty;
    } catch (e) {
      if (!isUnavailableError(e)) throw e;
      markDown(prisma, e);
      inSync = true;
    }
  }
  syncCache = { inSync, at: Date.now() };
  return inSync;
}

let turn = 0;

/**
 * Runs a read on one database, alternating between primary and replica, and retries
 * on the other one when the first is unavailable. Use only for staleness-tolerant POS
 * reads; anything that must see its own writes reads `prisma` directly.
 */
export async function readDb<T>(fn: (db: PrismaClient) => Promise<T>): Promise<T> {
  const dbs: PrismaClient[] = [prisma];
  if (replica && (await replicaInSync())) dbs.push(replica);
  if (dbs.length === 2 && turn++ % 2 === 1) dbs.reverse();

  // Healthy databases first; ones in cooldown only as a last resort
  const ordered = [...dbs.filter(isUp), ...dbs.filter(db => !isUp(db))];
  let lastError: unknown;
  for (const db of ordered) {
    try {
      return await fn(db);
    } catch (e) {
      if (!isUnavailableError(e)) throw e;
      markDown(db, e);
      lastError = e;
    }
  }
  throw lastError;
}
