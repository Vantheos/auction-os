import { defineConfig } from '@playwright/test';

// `vercel dev` proxies both the Vite frontend (auto-detected via vercel.ts
// framework: 'vite') and the api/* serverless functions on a single port.
// Running a second `npm run dev` in parallel makes them race for ports.
export default defineConfig({
  testDir: './tests/e2e',
  use: { baseURL: 'http://localhost:3000', trace: 'on-first-retry' },
  webServer: {
    command: 'npx vercel dev --listen 3000',
    url: 'http://localhost:3000/api/health',
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
  },
});
