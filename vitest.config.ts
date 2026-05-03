import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    environmentMatchGlobs: [
      ['tests/client/**', 'happy-dom'],
    ],
    globals: false,
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } }, // tests share one DB; serialize
    setupFiles: ['./tests/helpers/setup.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', 'tests/e2e/**'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@db': path.resolve(__dirname, 'db'),
      '@shared': path.resolve(__dirname, 'shared'),
    },
  },
});
