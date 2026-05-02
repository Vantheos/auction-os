// scripts/verify-env.ts
// Read-only: confirms CLIs are logged in, all three Supabase projects are reachable,
// and the GitHub remote points where expected. Does not write anything.
import 'dotenv/config';
import { execSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import postgres from 'postgres';
import { existsSync } from 'node:fs';
import { config as parseEnv } from 'dotenv';

// On Windows, npm-installed CLIs (vercel, gh on some setups) live in %APPDATA%\npm.
// Git-bash doesn't include that path by default — prepend so child processes resolve.
if (process.platform === 'win32' && process.env.APPDATA) {
  process.env.PATH = `${process.env.APPDATA}\\npm;${process.env.PATH ?? ''}`;
}

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
function tryExec(cmd: string, opts: { stripGithubToken?: boolean } = {}): { ok: boolean; out: string } {
  // gh CLI prefers GITHUB_TOKEN over keyring auth; if the env var is set but invalid,
  // every gh call 401s even though `gh auth login` (keyring) succeeded. Strip it for
  // gh invocations so the keyring credential is used.
  const env = opts.stripGithubToken
    ? Object.fromEntries(Object.entries(process.env).filter(([k]) => k !== 'GITHUB_TOKEN' && k !== 'GH_TOKEN'))
    : process.env;
  try { return { ok: true, out: execSync(cmd, { stdio: ['ignore', 'pipe', 'pipe'], env }).toString().trim() }; }
  catch (e: unknown) { return { ok: false, out: e instanceof Error ? e.message : String(e) }; }
}

async function checkSupabase(label: string, url: string, serviceKey: string, dbUrl: string) {
  // REST API: supabase-js v2 resolves with { data, error } rather than rejecting
  // on PostgREST errors. We deliberately query a nonexistent table — a structured
  // "table not found" error proves the round trip and auth worked. Auth failures
  // surface as messages like "Invalid API key" / "JWT expired" and must be treated
  // as failures even though the response is "structured".
  const sb = createClient(url, serviceKey, { auth: { persistSession: false } });
  let restOk = false;
  let restReason: string | undefined;
  try {
    const { error } = await sb.from('_does_not_matter').select('count').limit(1);
    if (!error) {
      restOk = true;
    } else {
      const msg = (error.message ?? '').toLowerCase();
      const looksLikeAuthFailure =
        msg.includes('invalid api key') || msg.includes('jwt') || msg.includes('unauthorized');
      if (looksLikeAuthFailure) {
        restOk = false;
        restReason = error.message;
      } else {
        // Any other PostgREST error (table not found, schema cache, etc.) means
        // PostgREST is reachable AND service_role key authenticated.
        restOk = true;
      }
    }
  } catch (e: unknown) {
    // Thrown = network/DNS/transport failure. That's a real reachability problem.
    restOk = false;
    restReason = e instanceof Error ? e.message : String(e);
  }
  check(`${label}: Supabase REST reachable`, restOk, restReason);

  // Direct DB
  let dbOk = false;
  let dbErr = '';
  try {
    const sql = postgres(dbUrl, { prepare: false, max: 1 });
    await sql`SELECT 1`;
    await sql.end();
    dbOk = true;
  } catch (e: unknown) { dbErr = e instanceof Error ? e.message : String(e); }
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
  const gh = tryExec('gh api user --jq .login', { stripGithubToken: true });
  check(`gh CLI logged in as ${setup.GITHUB_OWNER}`, gh.ok && gh.out === setup.GITHUB_OWNER, gh.out);
  const vercel = tryExec('vercel whoami');
  check('vercel CLI logged in', vercel.ok, vercel.out);

  // 3. GitHub repo exists
  const repoCheck = tryExec(`gh repo view ${setup.GITHUB_OWNER}/${setup.GITHUB_REPO} --json name --jq .name`, { stripGithubToken: true });
  check(`GitHub repo ${setup.GITHUB_OWNER}/${setup.GITHUB_REPO} exists`, repoCheck.ok, repoCheck.out);

  // 4. Three Supabase projects reachable
  await checkSupabase('Dev',  setup.DEV_SUPABASE_URL!,  setup.DEV_SUPABASE_SERVICE_ROLE_KEY!,  setup.DEV_DATABASE_URL!);
  await checkSupabase('Test', setup.TEST_SUPABASE_URL!, setup.TEST_SUPABASE_SERVICE_ROLE_KEY!, setup.TEST_DATABASE_URL!);
  await checkSupabase('Prod', setup.PROD_SUPABASE_URL!, setup.PROD_SUPABASE_SERVICE_ROLE_KEY!, setup.PROD_DATABASE_URL!);

  console.log(`\n${failed === 0 ? 'All checks passed ✓' : `${failed} check(s) failed`}`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
