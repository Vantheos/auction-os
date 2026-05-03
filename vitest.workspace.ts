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
    },
  },
]);
