// scripts/probe-deploy.ts
// Smoke-test a Vercel deployment by hitting /api/health.
// Usage: npm run probe:preview -- <deployment-url>
// Example: npm run probe:preview -- https://auction-xxxxx.vercel.app
//
// Uses `vercel curl` so it works against protected preview deployments
// (the CLI mints a one-shot bypass token). Requires the Vercel CLI to be
// installed and the local project to be linked via `vercel link`.

import { spawnSync } from 'node:child_process';

const url = process.argv[2];
if (!url) {
  console.error('usage: tsx scripts/probe-deploy.ts <deployment-url>');
  process.exit(2);
}

const result = spawnSync('vercel', ['curl', '--deployment', url, '/api/health'], {
  encoding: 'utf8',
  shell: process.platform === 'win32',
});

if (result.status !== 0) {
  console.error(`probe failed: vercel curl exited ${result.status}`);
  if (result.stderr) console.error(result.stderr);
  process.exit(1);
}

const body = result.stdout.trim();
let parsed: unknown;
try {
  parsed = JSON.parse(body);
} catch {
  console.error(`probe failed: /api/health did not return JSON`);
  console.error(body);
  process.exit(1);
}

if (typeof parsed !== 'object' || parsed === null || (parsed as { ok?: unknown }).ok !== true) {
  console.error(`probe failed: unexpected response shape`);
  console.error(JSON.stringify(parsed));
  process.exit(1);
}

console.log(`✓ ${url}/api/health → ${body}`);
