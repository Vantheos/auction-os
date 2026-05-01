// scripts/probe-deploy.ts
// Smoke-test a Vercel deployment by hitting a set of API endpoints.
// Usage: npm run probe:preview -- <deployment-url>
// Example: npm run probe:preview -- https://auction-xxxxx.vercel.app
//
// Uses `vercel curl` so it works against protected preview deployments
// (the CLI mints a one-shot bypass token). Requires the Vercel CLI to be
// installed and the local project to be linked via `vercel link`.
//
// Unauthed probes against protected endpoints expect 401 — this verifies
// routing + function are alive without needing a valid JWT.

import { spawnSync } from 'node:child_process';

const url = process.argv[2];
if (!url) {
  console.error('usage: tsx scripts/probe-deploy.ts <deployment-url>');
  process.exit(2);
}

type Probe = { name: string; path: string; method: string; body?: string; expectStatus?: number };

const PROBES: Probe[] = [
  { name: 'health', path: '/api/health', method: 'GET' },
  { name: 'system-settings', path: '/api/system-settings', method: 'GET', expectStatus: 401 },
  { name: 'lots-list', path: '/api/lots', method: 'GET', expectStatus: 401 },
  { name: 'labels-render', path: '/api/labels/render', method: 'POST', body: '{"lotId":"00000000-0000-0000-0000-000000000000"}', expectStatus: 401 },
];

let failed = 0;
for (const p of PROBES) {
  const args = ['curl', '--deployment', url, p.path, '--', '-s', '-o', '/dev/null', '-w', '%{http_code}', '-X', p.method];
  if (p.body) args.push('-H', 'Content-Type: application/json', '-d', p.body);
  const r = spawnSync('vercel', args, { encoding: 'utf8', shell: process.platform === 'win32' });
  if (r.status !== 0) {
    console.error(`✗ ${p.name}: vercel curl exit ${r.status}\n${r.stderr}`);
    failed++;
    continue;
  }
  const code = parseInt(r.stdout.trim().split('\n').pop() ?? '0', 10);
  const ok = p.expectStatus ? code === p.expectStatus : code >= 200 && code < 300;
  if (ok) console.log(`✓ ${p.name} → ${code}`);
  else { console.error(`✗ ${p.name} → ${code} (expected ${p.expectStatus ?? '2xx'})`); failed++; }
}

process.exit(failed > 0 ? 1 : 0);
