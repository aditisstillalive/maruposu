import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const TEST_DB = 'postgresql://postgres:dev@localhost:55433/maruposu_test';

// Only tests under src/ (keeps vitest out of .claude/worktrees and .next).
// `unit` needs nothing; `db` (*.db.test.ts) runs against the local docker
// Postgres from `npm run db:local`, with no replica configured.
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  // tsconfig keeps JSX for Next; tests render it with the automatic runtime
  esbuild: { jsx: 'automatic' },
  test: {
    projects: [
      { extends: true, test: { name: 'unit', include: ['src/**/*.test.{ts,tsx}'], exclude: ['src/**/*.db.test.ts'] } },
      {
        extends: true,
        test: {
          name: 'db',
          include: ['src/**/*.db.test.ts'],
          env: { DATABASE_URL: TEST_DB, DATABASE_URL_REPLICA: '' },
          globalSetup: ['src/lib/pos/test-db.setup.ts'],
          // db test files share one database: never run them side by side
          pool: 'forks',
          poolOptions: { forks: { singleFork: true } },
        },
      },
    ],
  },
});
