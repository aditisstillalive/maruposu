import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  replica: PrismaClient | null | undefined;
};

const log: ('query' | 'error' | 'warn')[] = process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'];

// Primary database: every write, plus admin, auth and device-session reads.
export const prisma = globalForPrisma.prisma ?? new PrismaClient({ log });

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
  return new PrismaClient({ log, datasources: { db: { url } } });
}

export const replica = globalForPrisma.replica !== undefined ? globalForPrisma.replica : createReplica();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
  globalForPrisma.replica = replica;
}
