import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  replica: PrismaClient | null | undefined;
};

const log: ('error' | 'warn')[] = process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'];

// PRISMA_LOG_QUERIES=1 prints one `prisma:query[<db>]` line per query, to measure
// how many queries a page or endpoint costs (see README, "Kuota gratis").
function withQueryLog(client: PrismaClient, label: string): PrismaClient {
  if (process.env.PRISMA_LOG_QUERIES !== '1') return client;
  (client as unknown as { $on: (e: 'query', cb: (ev: { query: string; duration: number }) => void) => void }).$on('query', ev =>
    console.log(`prisma:query[${label}] ${ev.duration}ms ${ev.query.slice(0, 160)}`)
  );
  return client;
}

const options = (url?: string) => ({
  log: [...log.map(level => ({ emit: 'stdout' as const, level })), ...(process.env.PRISMA_LOG_QUERIES === '1' ? [{ emit: 'event' as const, level: 'query' as const }] : [])],
  ...(url ? { datasources: { db: { url } } } : {}),
});

// Primary database: every write, plus admin, auth and device-session reads.
export const prisma = globalForPrisma.prisma ?? withQueryLog(new PrismaClient(options()), 'primary');

function dbKey(url: string | undefined): string | null {
  try {
    const u = new URL(url!);
    return `${u.host.replace('-pooler', '')}${u.pathname}`;
  } catch {
    return null;
  }
}

// Optional second database (DATABASE_URL_REPLICA). It only serves staleness-tolerant POS
// reads and is kept in sync from the primary (see replica-sync.ts).
function createReplica(): PrismaClient | null {
  const url = process.env.DATABASE_URL_REPLICA;
  if (!url) return null;
  if (dbKey(url) === dbKey(process.env.DATABASE_URL)) {
    console.warn('DATABASE_URL_REPLICA points at the primary database; replica disabled.');
    return null;
  }
  return withQueryLog(new PrismaClient(options(url)), 'replica');
}

export const replica = globalForPrisma.replica !== undefined ? globalForPrisma.replica : createReplica();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
  globalForPrisma.replica = replica;
}
