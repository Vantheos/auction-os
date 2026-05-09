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
      // Cap parallelism at 2. The default thread pool (~cpu_count-1)
      // and single-thread (maxThreads: 1) both showed similar cascade
      // rates, so parallelism wasn't the root cause — the actual
      // culprit was an unhandledRejection listener leak in
      // setup-client.ts (now fixed via a globalThis guard). 2 is the
      // sweet spot: real parallelism for speed, low enough that any
      // residual contention stays bounded. API project stays
      // single-fork (already serialized for shared test-DB safety).
      pool: 'threads',
      poolOptions: { threads: { minThreads: 1, maxThreads: 2 } },
    },
  },
]);
