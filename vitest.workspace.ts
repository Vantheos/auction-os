import { defineWorkspace } from 'vitest/config';

// Two projects so server tests (node env, single fork to serialize the
// shared test DB) and client tests (happy-dom env) don't interfere. Tried a
// single-pool environmentMatchGlobs setup first; happy-dom's globalThis
// installation doesn't reliably reset between node-env files within one
// fork, so client tests downstream of API tests lose `document`.
export default defineWorkspace([
  {
    extends: './vitest.config.ts',
    test: {
      name: 'api',
      include: [
        'tests/api/**/*.test.ts',
        'tests/lib/**/*.test.ts',
        'tests/helpers/**/*.test.ts',
      ],
      environment: 'node',
      pool: 'forks',
      poolOptions: { forks: { singleFork: true } },
      setupFiles: ['./tests/helpers/setup-api.ts'],
    },
  },
  {
    extends: './vitest.config.ts',
    test: {
      name: 'client',
      include: ['tests/client/**/*.test.{ts,tsx}'],
      environment: 'happy-dom',
      setupFiles: ['./tests/helpers/setup-client.ts'],
      // Cap parallelism. The default thread pool spawns ~cpu_count-1
      // workers, each running happy-dom + complex React trees + TanStack
      // Query + timers + spies. When the suite is run back-to-back with
      // build+lint (the pre-push trio), cumulative resource pressure has
      // caused waitFor/findBy timeouts to cascade across files (110 and
      // 123 failures observed in two separate trio runs, never the same
      // tests, immediately followed by clean solo re-runs). Capping to
      // 2 threads eliminates the cascade at a modest wall-time cost.
      // API project stays single-fork (already serialized for shared
      // test-DB safety).
      pool: 'threads',
      poolOptions: { threads: { minThreads: 1, maxThreads: 2 } },
    },
  },
]);
