// scripts/verify-env.ts
// Read-only: confirms CLIs are logged in, all three Supabase projects are reachable,
// and the GitHub remote points where expected. Does not write anything.
import 'dotenv/config';
import { execSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import postgres from 'postgres';
import { readFileSync, existsSync } from 'node:fs';
import { config as parseEnv } from 'dotenv';

const REQUIRED_SETUP_KEYS = [
  'DEV_SUPABASE_URL', 'DEV_SUPABASE_ANON_KEY', 'DEV_SUPABASE_SERVICE_ROLE_KEY', 'DEV_DATABASE_URL',
  'TEST_SUPABASE_URL', 'TEST_SUPABASE_ANON_KEY', 'TEST_SUPABASE_SERVICE_ROLE_KEY', 'TEST_DATABASE_URL',
  'PROD_SUPABASE_URL', 'PROD_SUPABASE_ANON_KEY', 'PROD_SUPABASE_SERVICE_ROLE_KEY', 'PROD_DATABASE_URL',
  'GITHUB_OWNER', 'GITHUB_REPO',
];

let failed = 0;
function check(label: string, ok: boolean, detail?: string) {
  console.log(`${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failed++;
}
function tryExec(cmd: string): { ok: boolean; out: string } {
  try { return { ok: true, out: execSync(cmd, { stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim() }; }
  catch (e: any) { return { ok: false, out: e.message ?? '' }; }
}

async function checkSupabase(label: string, url: string, serviceKey: string, dbUrl: string) {
  // REST API
  const sb = createClient(url, serviceKey, { auth: { persistSession: false } });
  const restRes = await sb.from('_does_not_matter').select('count').limit(1).then(
    () => ({ ok: true }),
    (err: any) => ({ ok: err?.code === '42P01' || err?.message?.includes('relation'), reason: err?.message })
  );
  // 42P01 = relation does not exist → REST is reachable, just no table. That's fine.
  check(`${label}: Supabase REST reachable`, restRes.ok, restRes.reason);

  // Direct DB
  let dbOk = false;
  let dbErr = '';
  try {
    const sql = postgres(dbUrl, { prepare: false, max: 1 });
    await sql`SELECT 1`;
    await sql.end();
    dbOk = true;
  } catch (e: any) { dbErr = e.message ?? String(e); }
  check(`${label}: Postgres direct connection`, dbOk, dbErr);
}

async function main() {
  console.log('=== Environment connectivity check ===\n');

  // 1. .env.setup exists and parses
  if (!existsSync('.env.setup')) {
    check('.env.setup exists', false, 'copy .env.setup.example to .env.setup and fill it in');
    process.exit(1);
  }
  const setup = parseEnv({ path: '.env.setup' }).parsed ?? {};
  for (const k of REQUIRED_SETUP_KEYS) {
    check(`.env.setup has ${k}`, !!setup[k] && setup[k] !== '');
  }
  if (failed > 0) { console.log('\nFix .env.setup and re-run.'); process.exit(1); }

  // 2. CLIs
  const node = tryExec('node --version');
  check('node CLI', node.ok, node.out);
  const npm = tryExec('npm --version');
  check('npm CLI', npm.ok, npm.out);
  const gh = tryExec('gh api user --jq .login');
  check(`gh CLI logged in as ${setup.GITHUB_OWNER}`, gh.ok && gh.out === setup.GITHUB_OWNER, gh.out);
  const vercel = tryExec('vercel whoami');
  check('vercel CLI logged in', vercel.ok, vercel.out);

  // 3. GitHub repo exists
  const repoCheck = tryExec(`gh repo view ${setup.GITHUB_OWNER}/${setup.GITHUB_REPO} --json name --jq .name`);
  check(`GitHub repo ${setup.GITHUB_OWNER}/${setup.GITHUB_REPO} exists`, repoCheck.ok, repoCheck.out);

  // 4. Three Supabase projects reachable
  await checkSupabase('Dev',  setup.DEV_SUPABASE_URL!,  setup.DEV_SUPABASE_SERVICE_ROLE_KEY!,  setup.DEV_DATABASE_URL!);
  await checkSupabase('Test', setup.TEST_SUPABASE_URL!, setup.TEST_SUPABASE_SERVICE_ROLE_KEY!, setup.TEST_DATABASE_URL!);
  await checkSupabase('Prod', setup.PROD_SUPABASE_URL!, setup.PROD_SUPABASE_SERVICE_ROLE_KEY!, setup.PROD_DATABASE_URL!);

  console.log(`\n${failed === 0 ? 'All checks passed ✓' : `${failed} check(s) failed`}`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
