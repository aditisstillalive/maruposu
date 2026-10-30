import { execSync } from 'node:child_process';

// Fresh schema for the db test project, from the real migrations.
export default function setup() {
  execSync('npx prisma migrate reset --force --skip-seed --skip-generate', {
    stdio: 'ignore',
    env: { ...process.env, DATABASE_URL: 'postgresql://postgres:dev@localhost:55433/maruposu_test' },
  });
}
