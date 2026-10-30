// Runs `prisma migrate <args>` against the replica (DATABASE_URL_REPLICA).
// Usage: npm run db:migrate:replica            -> migrate deploy
//        npm run db:migrate:replica -- status  -> migrate status
import { execSync } from 'child_process';

const url = process.env.DATABASE_URL_REPLICA;
if (!url) {
  console.error('DATABASE_URL_REPLICA is not set');
  process.exit(1);
}
const args = process.argv.slice(2).join(' ') || 'deploy';
execSync(`npx prisma migrate ${args}`, { stdio: 'inherit', env: { ...process.env, DATABASE_URL: url } });
