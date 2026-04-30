import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  use: { baseURL: 'http://localhost:5173', trace: 'on-first-retry' },
  webServer: [
    { command: 'npm run dev', url: 'http://localhost:5173', reuseExistingServer: !process.env.CI },
    { command: 'npx vercel dev --listen 3000', url: 'http://localhost:3000/api/health', reuseExistingServer: !process.env.CI },
  ],
});
