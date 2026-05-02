// vercel.ts
import type { VercelConfig } from '@vercel/config/v1';

export const config: VercelConfig = {
  framework: 'vite',
  buildCommand: 'npm run build',
  outputDirectory: 'dist',
  functions: {
    'api/**/*.ts': {
      // runtime omitted — Node.js is the platform default. Setting
      // `runtime: 'nodejs'` here is rejected as an invalid custom runtime
      // ("Function Runtimes must have a valid version") because Vercel
      // parses the string as a package name expecting an @version suffix.
      // memory removed — ignored on Active CPU billing per platform warning.
      maxDuration: 60,
    },
  },
  // SPA fallback: any non-/api/* path that isn't a static file gets the
  // Vite-built index.html so React Router can handle the route. Without
  // this, direct URL navigation or a hard refresh on /customers, /login,
  // etc. returns 404 — only navigation starting from / works.
  rewrites: [
    { source: '/((?!api/).*)', destination: '/index.html' },
  ],
  // Cache-Control headers — written explicitly so iOS Safari (and other
  // browsers) reliably pick up new builds without manual cache clearing.
  // Vite emits content-hashed filenames for assets, so they're safe to
  // cache forever. The HTML shell (everything else served via the SPA
  // fallback rewrite) must always revalidate so it picks up the latest
  // hashed asset references after a deploy.
  headers: [
    {
      source: '/assets/(.*)',
      headers: [
        { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
      ],
    },
    {
      source: '/((?!api/|assets/).*)',
      headers: [
        { key: 'Cache-Control', value: 'no-cache, must-revalidate' },
      ],
    },
  ],
  // Phase 3: sweep abandoned in-progress lots every 15 minutes.
  // Vercel auto-injects an Authorization: Bearer ${CRON_SECRET} header
  // when invoking; the handler verifies via requireCronAuth.
  crons: [
    { path: '/api/cron/cleanup-orphan-lots', schedule: '*/15 * * * *' },
  ],
};
