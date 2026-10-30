// Full copy of every synced table from the primary (DATABASE_URL) to the replica
// (DATABASE_URL_REPLICA). Usage: npm run db:sync:replica
import { fullSync } from '../src/lib/replica-sync';
import { prisma, replica } from '../src/lib/prisma';

async function main() {
  const result = await fullSync();
  if (!result.ok) {
    console.error(`Replica sync failed: ${result.error}`);
    process.exitCode = 1;
  } else {
    console.log(`Replica synced: ${result.rows} rows copied${result.inSync ? '' : ' (changes arrived meanwhile; run again)'}.`);
  }
  await Promise.all([prisma.$disconnect(), replica?.$disconnect()]);
}

main();
