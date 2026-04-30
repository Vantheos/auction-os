import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } }, // tests share one DB; serialize
    setupFiles: ['./tests/helpers/setup.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@db': path.resolve(__dirname, 'db'),
      '@shared': path.resolve(__dirname, 'shared'),
    },
  },
});
