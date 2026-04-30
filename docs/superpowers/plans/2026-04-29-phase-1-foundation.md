# Phase 1 — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the project scaffolding, database schema, auth, RLS, and admin CRUD for `customer` / `job` / `app_user` so an authenticated admin can log in and create customers and jobs through a basic UI.

**Architecture:** Single repo (no monorepo overhead). Vite + React + TypeScript SPA front end. Hono running on Vercel Functions (Fluid Compute, Node 24) for the API. Supabase managed Postgres with Drizzle for migrations and queries; Supabase Auth + Custom Access Token Hook to inject `role` into the JWT; RLS policies enforce role-based access at the database layer. UI uses shadcn/ui with Tailwind CSS, themed to the Mica Slate tokens from the design pass.

**Tech Stack:** Vite, React 18, TypeScript 5, Tailwind CSS, shadcn/ui, React Router, TanStack Query, React Hook Form, Zod, Hono, Drizzle ORM, postgres-js driver, Supabase JS client, Vitest, Playwright (smoke tests only this phase), Vercel.

**Spec reference:** `docs/superpowers/specs/2026-04-29-v1-design.md` §3, §4, §12 cover everything implemented in this phase.

---

## Environment topology (decided)

Cloud-first. **Three Supabase projects** on the user's existing Pro plan, no local Supabase, no Docker required. Verified Node v24 LTS; user runs commands from the VSCode integrated terminal.

| Environment | Purpose | DB |
|---|---|---|
| Local dev (`npm run dev`) | Daily coding | **Dev** Supabase project |
| `npm test` | Vitest API tests with `truncateAll` | **Test** Supabase project |
| Vercel preview (every branch / PR) | Auto-deployed preview URLs | **Dev** Supabase project |
| Vercel production (`main` branch) | Production | **Prod** Supabase project |

**Accounts:**
- GitHub: **`Vantheos`**
- Vercel: TBD (user picks the team/scope during Stage 0a)
- Supabase: user's existing $25/mo Pro account; create three projects: `auction-os-dev`, `auction-os-test`, `auction-os-prod`.

---

## Pre-execution checklist (manual, before subagent execution starts)

The user does these in their own time. The subagent does **not** start Task 0 until all of these are done.

- [ ] **Stage 0a — CLI auth verification** (in progress as of 2026-04-29)
  1. `node --version` → v20+ (v24 LTS confirmed)
  2. `git --version`, `docker --version` (Docker installed but unused for v1)
  3. `npm i -g vercel` then `vercel login` → `vercel whoami` succeeds
  4. Install GitHub CLI (`winget install GitHub.cli` or Scoop) → `gh auth login` → `gh api user --jq .login` returns `Vantheos`
  5. `vercel teams ls` → user picks the scope they want this project under (`vercel switch <slug>` if needed)
  6. `npx supabase --version` runs (no Supabase login needed yet)

- [ ] **Stage 0b — create cloud resources**
  1. Create three Supabase projects in the dashboard: `auction-os-dev`, `auction-os-test`, `auction-os-prod` (same region for all three).
  2. From each project, copy: Project URL, `anon` key, `service_role` key, JWT secret (Settings → API → JWT Settings), pooled connection string (Settings → Database → Connection String → "Transaction" mode, port 6543).
  3. Create the GitHub repo: `gh repo create Vantheos/auction-os --private --source=. --remote=origin` (run from `D:\Dev\auction-os`). Do NOT push yet — Task 1 commits land first.
  4. Fill `.env.setup` (template created in Task 0 — see Task 0 instructions; or create a placeholder `.env.setup` ahead of time using the schema in Task 0.1).

After Stage 0a + 0b are done, the user runs `npm run env:verify` (created in Task 0) to confirm everything is wired correctly. Green checks across the board → subagent execution begins with Task 1.

---

## File structure created in this phase

```
auction-os/
├── .env.example
├── .gitignore
├── README.md
├── package.json
├── tsconfig.json
├── tsconfig.node.json
├── vite.config.ts
├── tailwind.config.ts
├── postcss.config.js
├── components.json                 # shadcn/ui config
├── drizzle.config.ts
├── vercel.ts
├── index.html
│
├── src/                            # Frontend
│   ├── main.tsx
│   ├── App.tsx
│   ├── styles/
│   │   └── globals.css             # Tailwind + Mica Slate tokens
│   ├── lib/
│   │   ├── supabase.ts             # Supabase browser client
│   │   ├── api.ts                  # API fetch wrapper with auth header
│   │   ├── auth.ts                 # auth helpers (signIn, signOut, useUser)
│   │   └── query.ts                # TanStack Query client
│   ├── components/
│   │   ├── ui/                     # shadcn components (button, input, etc.)
│   │   ├── auth/
│   │   │   └── ProtectedRoute.tsx
│   │   └── shell/
│   │       └── AdminShell.tsx      # rail nav + content
│   ├── routes/
│   │   ├── Login.tsx
│   │   ├── Customers.tsx           # list + create dialog
│   │   └── CustomerDetail.tsx      # customer header + jobs list + create/edit job
│   └── hooks/
│       ├── useCustomers.ts
│       └── useJobs.ts
│
├── api/                            # Hono on Vercel Functions
│   ├── _app.ts                     # Hono app factory + shared middleware
│   ├── _middleware/
│   │   └── auth.ts                 # JWT verify + role check
│   ├── _lib/
│   │   ├── db.ts                   # Drizzle client (per-request)
│   │   └── responses.ts            # JSON error helpers
│   ├── health.ts                   # /api/health
│   ├── customers/
│   │   ├── index.ts                # GET, POST /api/customers
│   │   └── [id].ts                 # GET, PATCH, DELETE /api/customers/:id
│   ├── jobs/
│   │   ├── index.ts                # GET, POST /api/jobs (filter by customer_id)
│   │   └── [id].ts                 # GET, PATCH, DELETE /api/jobs/:id
│   └── users/
│       ├── index.ts                # GET, POST /api/users (admin only)
│       └── [id].ts                 # PATCH /api/users/:id (admin only)
│
├── db/                             # Drizzle schema + types
│   ├── schema.ts                   # all v1 tables
│   ├── client.ts                   # node-postgres pool factory
│   └── types.ts                    # inferred row types re-exported
│
├── supabase/
│   ├── config.toml                 # Supabase local CLI config
│   ├── migrations/                 # raw SQL Supabase migrations
│   │   ├── 20260429000001_drizzle_schema.sql      # generated by Drizzle
│   │   ├── 20260429000002_rls_policies.sql        # hand-written RLS
│   │   ├── 20260429000003_jwt_custom_claim_hook.sql
│   │   └── 20260429000004_audit_log_triggers.sql
│   └── seed/
│       └── README.md               # how to provision initial admin
│
├── scripts/
│   └── seed-admin.ts               # one-off provisioning script
│
├── shared/
│   └── types.ts                    # shared API request/response types
│
└── tests/
    ├── api/
    │   ├── customers.test.ts
    │   ├── jobs.test.ts
    │   └── users.test.ts
    ├── helpers/
    │   ├── test-db.ts              # spawns a clean test schema per test run
    │   └── test-jwt.ts             # mints role-stamped JWTs for tests
    └── e2e/
        └── smoke.spec.ts           # Playwright smoke
```

---

## Tasks

### Task 0: Environment setup scripts

**Goal:** Write two scripts (`scripts/verify-env.ts`, `scripts/env-setup.ts`) and a `.env.setup.example` template. These automate the connection of the user's GitHub repo, three Supabase projects, and Vercel project so the rest of Phase 1 can run without dashboard clicking.

**Execution order:** Although numbered Task 0, **this task runs immediately AFTER Task 1's commit** (step 1.10). Reason: Task 0 uses `tsx` to run TypeScript scripts, and `tsx` is installed by Task 1's `npm install` (step 1.7). The flow is: complete Task 1 → execute Task 0 → continue with Task 2. The user's manual prerequisites (CLI auth + Supabase project creation + filled `.env.setup`) must be in place before Task 0 starts.

**Prerequisite:** The user has completed the pre-execution checklist above (Stage 0a CLI auth + Stage 0b cloud resources created). Do NOT execute this task before that.

**Files:**
- Create: `.env.setup.example`
- Create: `scripts/verify-env.ts`
- Create: `scripts/env-setup.ts`
- Modify: `package.json` (add `env:verify` and `env:setup` scripts)

- [ ] **Step 0.1: Create `.env.setup.example`** — the template the user fills with cloud credentials

```
# Three sets of credentials, one per Supabase project.
# Copy this file to .env.setup (gitignored) and fill in.

# Modern Supabase signs JWTs with ES256 (asymmetric). Backend verifies via the
# public JWKS at <SUPABASE_URL>/auth/v1/.well-known/jwks.json — no shared secret.

# ── Dev environment ────────────────────────────────────────
DEV_SUPABASE_URL=
DEV_SUPABASE_ANON_KEY=
DEV_SUPABASE_SERVICE_ROLE_KEY=
DEV_DATABASE_URL=

# ── Test environment (used by `npm test`) ──────────────────
TEST_SUPABASE_URL=
TEST_SUPABASE_ANON_KEY=
TEST_SUPABASE_SERVICE_ROLE_KEY=
TEST_DATABASE_URL=

# ── Prod environment ───────────────────────────────────────
PROD_SUPABASE_URL=
PROD_SUPABASE_ANON_KEY=
PROD_SUPABASE_SERVICE_ROLE_KEY=
PROD_DATABASE_URL=

# ── GitHub ─────────────────────────────────────────────────
GITHUB_OWNER=Vantheos
GITHUB_REPO=auction-os
```

Add `.env.setup` (without `.example`) to `.gitignore` if not already covered by `.env*`.

- [ ] **Step 0.2: Create `scripts/verify-env.ts`** — read-only health check

```ts
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
```

- [ ] **Step 0.3: Create `scripts/env-setup.ts`** — pushes Vercel env vars + writes `.env` (local dev)

```ts
// scripts/env-setup.ts
// Reads .env.setup, applies environment variables to Vercel (preview + production scopes),
// writes a local .env file pointing at the Dev Supabase project,
// and writes .env.test pointing at the Test Supabase project.
// Idempotent: re-running updates existing values.
import 'dotenv/config';
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { config as parseEnv } from 'dotenv';

type Scope = 'production' | 'preview' | 'development';

const setup = parseEnv({ path: '.env.setup' }).parsed ?? {};
if (Object.keys(setup).length === 0) {
  console.error('.env.setup not found or empty. Run env:verify first.');
  process.exit(1);
}

function vercelEnvSet(key: string, value: string, scope: Scope) {
  // Try to remove first (silently); then add. Avoids the interactive "value exists" prompt.
  try { execSync(`vercel env rm ${key} ${scope} --yes`, { stdio: 'ignore' }); } catch { /* ignore */ }
  execSync(`echo "${value.replace(/"/g, '\\"')}" | vercel env add ${key} ${scope}`, { stdio: 'inherit' });
}

const ENV_VARS = [
  'SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'DATABASE_URL',
];

console.log('Pushing env vars to Vercel...\n');

// Production scope ← Prod credentials
for (const k of ENV_VARS) vercelEnvSet(k, setup[`PROD_${k}`]!, 'production');
// VITE_ mirrors for browser-bundled vars
vercelEnvSet('VITE_SUPABASE_URL', setup.PROD_SUPABASE_URL!, 'production');
vercelEnvSet('VITE_SUPABASE_ANON_KEY', setup.PROD_SUPABASE_ANON_KEY!, 'production');

// Preview + Development scopes ← Dev credentials
for (const scope of ['preview', 'development'] as Scope[]) {
  for (const k of ENV_VARS) vercelEnvSet(k, setup[`DEV_${k}`]!, scope);
  vercelEnvSet('VITE_SUPABASE_URL', setup.DEV_SUPABASE_URL!, scope);
  vercelEnvSet('VITE_SUPABASE_ANON_KEY', setup.DEV_SUPABASE_ANON_KEY!, scope);
}

console.log('\nWriting .env (local dev → Dev Supabase) and .env.test (→ Test Supabase)...\n');

const envLocal = [
  `# Auto-generated by env:setup. Do not edit; re-run \`npm run env:setup\` to refresh.`,
  `SUPABASE_URL=${setup.DEV_SUPABASE_URL}`,
  `SUPABASE_ANON_KEY=${setup.DEV_SUPABASE_ANON_KEY}`,
  `SUPABASE_SERVICE_ROLE_KEY=${setup.DEV_SUPABASE_SERVICE_ROLE_KEY}`,
  `DATABASE_URL=${setup.DEV_DATABASE_URL}`,
  `VITE_SUPABASE_URL=${setup.DEV_SUPABASE_URL}`,
  `VITE_SUPABASE_ANON_KEY=${setup.DEV_SUPABASE_ANON_KEY}`,
  `VITE_API_BASE_URL=/api`,
  '',
].join('\n');
writeFileSync('.env', envLocal);

const envTest = [
  `# Auto-generated by env:setup. Used by \`npm test\` (vitest).`,
  `SUPABASE_URL=${setup.TEST_SUPABASE_URL}`,
  `SUPABASE_ANON_KEY=${setup.TEST_SUPABASE_ANON_KEY}`,
  `SUPABASE_SERVICE_ROLE_KEY=${setup.TEST_SUPABASE_SERVICE_ROLE_KEY}`,
  `DATABASE_URL=${setup.TEST_DATABASE_URL}`,
  '',
].join('\n');
writeFileSync('.env.test', envTest);

console.log('Done. .env and .env.test written. Vercel env vars synced.');
```

- [ ] **Step 0.4: Add `env:verify` and `env:setup` scripts to `package.json`**

In `package.json`, add to the `scripts` block:

```json
"env:verify": "tsx scripts/verify-env.ts",
"env:setup": "tsx scripts/env-setup.ts",
```

- [ ] **Step 0.5: Run verify and report**

```bash
npm run env:verify
```

Expected: green checks across all rows. If any fails, follow the inline guidance and re-run.

- [ ] **Step 0.6: Run setup**

```bash
npm run env:setup
```

Expected: env vars pushed to Vercel for `production`, `preview`, `development` scopes; `.env` and `.env.test` files written locally.

- [ ] **Step 0.7: Re-run verify after setup**

```bash
npm run env:verify
```

Expected: all checks still green. The `.env` is now in place; `.env.test` is in place.

- [ ] **Step 0.8: Commit**

```bash
git add scripts/ .env.setup.example package.json .gitignore
git commit -m "chore(env): verify-env and env-setup scripts + .env.setup template"
```

---

### Task 1: Repo initialization and base tooling

**Files:**
- Create: `package.json`, `tsconfig.json`, `tsconfig.node.json`, `.gitignore`, `.env.example`, `README.md`

- [ ] **Step 1.1: `git init` and create the working directory layout**

```bash
cd D:/Dev/auction-os
git init
mkdir -p src/components/ui src/lib src/routes src/hooks src/styles src/components/auth src/components/shell
mkdir -p api/_middleware api/_lib api/customers api/jobs api/users
mkdir -p db
mkdir -p supabase/migrations supabase/seed
mkdir -p scripts
mkdir -p shared
mkdir -p tests/api tests/helpers tests/e2e
```

- [ ] **Step 1.2: Create `package.json`**

```json
{
  "name": "auction-os",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "lint": "eslint .",
    "typecheck": "tsc -b --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "db:generate": "drizzle-kit generate",
    "db:push": "drizzle-kit push",
    "supabase:start": "supabase start",
    "supabase:reset": "supabase db reset",
    "seed:admin": "tsx scripts/seed-admin.ts"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.45.0",
    "@tanstack/react-query": "^5.59.0",
    "drizzle-orm": "^0.36.0",
    "hono": "^4.6.0",
    "jose": "^5.9.0",
    "postgres": "^3.4.5",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-hook-form": "^7.53.0",
    "react-router-dom": "^6.27.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@playwright/test": "^1.48.0",
    "@types/node": "^22.7.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vercel/config": "^1.0.0",
    "@vitejs/plugin-react": "^4.3.0",
    "autoprefixer": "^10.4.20",
    "dotenv": "^16.4.5",
    "drizzle-kit": "^0.28.0",
    "eslint": "^9.12.0",
    "postcss": "^8.4.47",
    "supabase": "^1.207.0",
    "tailwindcss": "^3.4.13",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0",
    "vite": "^5.4.0",
    "vitest": "^2.1.0"
  },
  "engines": {
    "node": ">=20"
  }
}
```

- [ ] **Step 1.3: Create `tsconfig.json` and `tsconfig.node.json`**

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "jsx": "react-jsx",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "allowImportingTsExtensions": false,
    "noEmit": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"],
      "@db/*": ["db/*"],
      "@shared/*": ["shared/*"],
      "@api/*": ["api/*"]
    }
  },
  "include": ["src", "api", "db", "shared", "tests", "scripts"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

`tsconfig.node.json`:
```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "target": "ES2022"
  },
  "include": ["vite.config.ts", "tailwind.config.ts", "postcss.config.js", "drizzle.config.ts", "vercel.ts"]
}
```

- [ ] **Step 1.4: Create `.gitignore`**

```
node_modules
dist
.env
.env.local
.env.*.local
.vercel
.turbo
.supabase
*.log
.DS_Store
playwright-report
test-results
coverage
```

- [ ] **Step 1.5: Create `.env.example` (NEVER commit `.env` itself)**

```
# Supabase
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Direct DB (Drizzle migrations + server-side queries)
DATABASE_URL=postgres://postgres:postgres@localhost:54322/postgres

# JWT verification: modern Supabase signs with ES256 (asymmetric).
# The backend fetches the public JWKS from <SUPABASE_URL>/auth/v1/.well-known/jwks.json
# automatically — no shared secret env var is needed.

# Public env vars for the browser (Vite prefixes with VITE_)
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_API_BASE_URL=/api
```

- [ ] **Step 1.6: Create `README.md`** (minimal — full docs later)

```markdown
# Auction Inventory SaaS

See `docs/superpowers/specs/2026-04-29-v1-design.md` for the v1 design spec.
See `ui-design/design_handoff/` for visual designs.

## Local development

1. `npm install`
2. Copy `.env.example` to `.env` and fill in Supabase credentials.
3. `supabase start` to start local Supabase (Postgres + Auth on port 54321).
4. `npm run db:push` to apply Drizzle schema.
5. `npm run seed:admin` to provision the initial admin user.
6. `npm run dev` to start the Vite dev server.

## Tech stack

React + Vite + TypeScript + Tailwind + shadcn/ui · Hono on Vercel · Supabase (Postgres + Auth + RLS + Storage) · Drizzle ORM
```

- [ ] **Step 1.7: Install dependencies and commit**

```bash
npm install
git add -A
git commit -m "chore: initial repo scaffolding (package.json, tsconfig, gitignore)"
```

---

### Task 2: Vite + React + Tailwind + shadcn/ui frontend setup

**Files:**
- Create: `vite.config.ts`, `tailwind.config.ts`, `postcss.config.js`, `components.json`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/styles/globals.css`

- [ ] **Step 2.1: Create `vite.config.ts`**

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@db': path.resolve(__dirname, 'db'),
      '@shared': path.resolve(__dirname, 'shared'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
});
```

- [ ] **Step 2.2: Create `tailwind.config.ts`** (Mica Slate tokens from design handoff)

```ts
import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        accent: '#1E40AF',
        text: '#0F172A',
        textDim: '#475569',
        textFaint: '#94A3B8',
        border: 'rgba(15,23,42,0.08)',
        borderStrong: 'rgba(15,23,42,0.14)',
        surface: 'rgba(255,255,255,0.72)',
        surfaceAlt: '#F8FAFC',
        surfaceSolid: '#FFFFFF',
        success: { DEFAULT: '#15803D', bg: '#DCFCE7' },
        warning: { DEFAULT: '#92400E', bg: '#FEF3C7' },
        danger: { DEFAULT: '#B91C1C', bg: '#FEE2E2' },
        info: { DEFAULT: '#1E40AF', bg: '#DBEAFE' },
      },
      fontFamily: {
        sans: ['"Segoe UI Variable"', '"Segoe UI"', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', '"SF Mono"', 'monospace'],
      },
      borderRadius: {
        DEFAULT: '6px',
        lg: '10px',
        pill: '12px',
      },
      backgroundImage: {
        wash: 'linear-gradient(180deg, #EFF1F4 0%, #E5E7EC 100%)',
      },
    },
  },
  plugins: [],
} satisfies Config;
```

- [ ] **Step 2.3: Create `postcss.config.js`**

```js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

- [ ] **Step 2.4: Create `src/styles/globals.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  html, body, #root {
    height: 100%;
  }
  body {
    @apply bg-wash text-text font-sans antialiased;
  }
}
```

- [ ] **Step 2.5: Create `index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Auction OS</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 2.6: Create `src/main.tsx` and `src/App.tsx`**

`src/main.tsx`:
```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { App } from './App';
import { queryClient } from './lib/query';
import './styles/globals.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
```

`src/App.tsx`:
```tsx
export function App() {
  return (
    <main className="min-h-screen flex items-center justify-center">
      <h1 className="text-2xl font-semibold">Auction OS</h1>
    </main>
  );
}
```

- [ ] **Step 2.7: Create `src/lib/query.ts`**

```ts
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, refetchOnWindowFocus: false },
  },
});
```

- [ ] **Step 2.8: Initialize shadcn/ui and add base components**

```bash
npx shadcn@latest init -d
# Use options:
#   - TypeScript: yes
#   - Style: New York
#   - Base color: Slate
#   - CSS variables: yes
#   - tailwind.config.ts already exists — overwrite no
npx shadcn@latest add button input label dialog table form select
```

Verify the generated `components.json` references `@/components/ui` and the `@/` alias matches `tsconfig.json`.

- [ ] **Step 2.9: Verify dev server runs**

Run: `npm run dev`
Expected: Vite serves on `http://localhost:5173`, page shows "Auction OS" centered.

- [ ] **Step 2.10: Commit**

```bash
git add -A
git commit -m "feat(frontend): scaffold Vite + React + Tailwind + shadcn/ui with Mica Slate tokens"
```

---

### Task 3: Drizzle schema for all v1 tables

**Files:**
- Create: `drizzle.config.ts`, `db/schema.ts`, `db/client.ts`, `db/types.ts`

This task defines the entire v1 database schema in one Drizzle file. Even tables not user-visible until later phases (lot, lot_photo) are defined now so subsequent phases don't fight migrations.

- [ ] **Step 3.1: Create `drizzle.config.ts`**

```ts
import type { Config } from 'drizzle-kit';

export default {
  schema: './db/schema.ts',
  out: './supabase/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:54322/postgres',
  },
  // Generate timestamp-prefixed filenames Supabase expects
  breakpoints: true,
} satisfies Config;
```

- [ ] **Step 3.2: Create `db/schema.ts`** — all v1 tables per spec §4

```ts
import { pgTable, pgEnum, uuid, text, integer, numeric, boolean, timestamp, time, jsonb, primaryKey, uniqueIndex, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// ── Enums ────────────────────────────────────────────────────────────────
export const roleEnum = pgEnum('role', ['admin', 'office', 'warehouse']);
export const lotStateEnum = pgEnum('lot_state', ['assigned', 'unassigned', 'sold', 'picked-up', 'not-sellable']);
export const photoStatusEnum = pgEnum('photo_status', ['pending', 'uploaded', 'failed']);
export const aiRunStatusEnum = pgEnum('ai_run_status', ['success', 'partial', 'failure']);
export const specialNotesCategoryEnum = pgEnum('special_notes_category', ['None', 'TOOL ONLY', 'READ', 'CLOTHING']);
export const conditionEnum = pgEnum('condition', ['used']); // single value in v1; vocab expanded post-v1
export const aiScheduleFrequencyEnum = pgEnum('ai_schedule_frequency', ['hourly', 'daily']);
export const auditChangeTypeEnum = pgEnum('audit_change_type', ['insert', 'update', 'delete']);

// ── app_user (mirrors auth.users) ────────────────────────────────────────
export const appUser = pgTable('app_user', {
  id: uuid('id').primaryKey().notNull(), // FK to auth.users.id, enforced by trigger
  role: roleEnum('role').notNull(),
  displayName: text('display_name').notNull(),
  disabledAt: timestamp('disabled_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── customer ─────────────────────────────────────────────────────────────
export const customer = pgTable('customer', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── job ──────────────────────────────────────────────────────────────────
export const job = pgTable('job', {
  id: uuid('id').primaryKey().defaultRandom(),
  customerId: uuid('customer_id').notNull().references(() => customer.id, { onDelete: 'restrict' }),
  jobNumber: text('job_number').notNull(),
  closedAt: timestamp('closed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uniqCustomerJob: uniqueIndex('uniq_customer_job_number').on(t.customerId, t.jobNumber),
}));

// ── lot ──────────────────────────────────────────────────────────────────
export const lot = pgTable('lot', {
  id: uuid('id').primaryKey().defaultRandom(),
  jobId: uuid('job_id').references(() => job.id, { onDelete: 'restrict' }),
  lotNumber: integer('lot_number'),
  quantity: integer('quantity'),
  title: text('title'),
  description: text('description'),
  price: numeric('price', { precision: 10, scale: 2 }),
  condition: conditionEnum('condition').notNull().default('used'),
  ref1: text('ref1'),
  ref2: text('ref2'),
  specialNotesCategory: specialNotesCategoryEnum('special_notes_category').notNull().default('None'),
  specialNotesText: text('special_notes_text'),
  untested: boolean('untested').notNull().default(false),
  state: lotStateEnum('state').notNull().default('assigned'),
  lastAiRunStatus: aiRunStatusEnum('last_ai_run_status'),
  lastAiRunError: text('last_ai_run_error'),
  intakeOperatorId: uuid('intake_operator_id').notNull().references(() => appUser.id),
  intakeTimestamp: timestamp('intake_timestamp', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  // Partial unique index: enforce (job_id, lot_number) uniqueness only when both are NOT NULL
  uniqJobLot: uniqueIndex('uniq_job_lot_number').on(t.jobId, t.lotNumber).where(sql`${t.jobId} IS NOT NULL`),
  // CHECK: state ∈ {assigned, sold, picked-up} requires job_id and lot_number; state ∈ {unassigned, not-sellable} requires both null
  stateTupleCk: check('state_tuple_consistent', sql`(
    (${t.state} IN ('assigned','sold','picked-up') AND ${t.jobId} IS NOT NULL AND ${t.lotNumber} IS NOT NULL)
    OR
    (${t.state} IN ('unassigned','not-sellable') AND ${t.jobId} IS NULL AND ${t.lotNumber} IS NULL)
  )`),
}));

// ── lot_photo ────────────────────────────────────────────────────────────
export const lotPhoto = pgTable('lot_photo', {
  id: uuid('id').primaryKey().defaultRandom(),
  lotId: uuid('lot_id').notNull().references(() => lot.id, { onDelete: 'cascade' }),
  storagePath: text('storage_path').notNull(),
  displayOrder: integer('display_order').notNull(),
  status: photoStatusEnum('status').notNull().default('pending'),
  capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
  capturedBy: uuid('captured_by').notNull().references(() => appUser.id),
});

// ── system_settings (singleton) ──────────────────────────────────────────
export const systemSettings = pgTable('system_settings', {
  id: integer('id').primaryKey().notNull().default(1),
  aiScheduleEnabled: boolean('ai_schedule_enabled').notNull().default(true),
  aiScheduleFrequency: aiScheduleFrequencyEnum('ai_schedule_frequency').notNull().default('daily'),
  aiScheduleTimeOfDay: time('ai_schedule_time_of_day').notNull().default('23:00:00'),
  aiLastRunAt: timestamp('ai_last_run_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  singletonCk: check('system_settings_singleton', sql`${t.id} = 1`),
}));

// ── audit_log ────────────────────────────────────────────────────────────
export const auditLog = pgTable('audit_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  tableName: text('table_name').notNull(),
  recordId: uuid('record_id').notNull(),
  changeType: auditChangeTypeEnum('change_type').notNull(),
  changedFields: jsonb('changed_fields').notNull(),
  changedBy: uuid('changed_by').references(() => appUser.id),
  changedAt: timestamp('changed_at', { withTimezone: true }).notNull().defaultNow(),
});
```

- [ ] **Step 3.3: Create `db/client.ts`** (per-request Drizzle client)

```ts
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

// Single shared client; postgres-js handles pooling internally
const queryClient = postgres(url, { prepare: false });
export const db = drizzle(queryClient, { schema });

export type DB = typeof db;
```

- [ ] **Step 3.4: Create `db/types.ts`** (re-export inferred row types)

```ts
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import * as s from './schema';

export type AppUser = InferSelectModel<typeof s.appUser>;
export type AppUserInsert = InferInsertModel<typeof s.appUser>;
export type Customer = InferSelectModel<typeof s.customer>;
export type CustomerInsert = InferInsertModel<typeof s.customer>;
export type Job = InferSelectModel<typeof s.job>;
export type JobInsert = InferInsertModel<typeof s.job>;
export type Lot = InferSelectModel<typeof s.lot>;
export type LotPhoto = InferSelectModel<typeof s.lotPhoto>;
```

- [ ] **Step 3.5: Generate migration**

Run: `npm run db:generate -- --name initial_schema`
Expected: A new file `supabase/migrations/<timestamp>_initial_schema.sql` is created containing all tables, enums, indexes, and CHECK constraints.

Inspect the generated SQL — confirm it includes:
- All 5 enums
- All 7 tables (`app_user`, `customer`, `job`, `lot`, `lot_photo`, `system_settings`, `audit_log`)
- The partial unique index on `(job_id, lot_number)`
- The state-tuple CHECK constraint
- The singleton CHECK on `system_settings`

- [ ] **Step 3.6: Commit**

```bash
git add db/ drizzle.config.ts supabase/migrations/
git commit -m "feat(db): drizzle schema for all v1 tables (customer, job, lot, lot_photo, app_user, system_settings, audit_log)"
```

---

### Task 4: Apply schema to Dev and Test Supabase projects

**Files:**
- Create: `supabase/config.toml` (generated by `supabase init`)
- Create: `supabase/migrations/<next-timestamp>_seed_system_settings.sql`

The cloud-first topology means there is **no local Supabase**. The Drizzle-generated migrations from Task 3 are applied to both the **Dev** and **Test** Supabase projects via `supabase link` + `supabase db push`. Production migrations are deferred until the very end of Phase 1 (Task 21) as a deliberate manual promotion.

- [ ] **Step 4.1: Initialize the local supabase folder structure**

```bash
npx supabase init
```

Creates `supabase/config.toml`. The migrations subfolder already exists from Task 3.

- [ ] **Step 4.2: Add the `system_settings` singleton seed migration**

The Drizzle schema declares `system_settings` with default values but no row. We need exactly one row (`id=1`) for the AI scheduler. Create `supabase/migrations/<next-timestamp>_seed_system_settings.sql`:

```sql
INSERT INTO system_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
```

- [ ] **Step 4.3: Push migrations to the Dev Supabase project**

Get the Dev project ref from the Supabase dashboard URL (`app.supabase.com/project/<project-ref>`), then:

```bash
npx supabase link --project-ref <dev-project-ref>
# Will prompt for the database password (the one you set when creating the project)
npx supabase db push
```

Expected: all migrations apply cleanly. Verify with the Dev `DATABASE_URL` from `.env.setup`:

```bash
# Replace with actual DEV_DATABASE_URL value from .env.setup
psql "<DEV_DATABASE_URL>" -c "\dt public.*"
```

Expected output: `app_user`, `customer`, `job`, `lot`, `lot_photo`, `system_settings`, `audit_log`.

```bash
psql "<DEV_DATABASE_URL>" -c "SELECT * FROM system_settings;"
```

Expected: one row with `id=1`, defaults populated.

- [ ] **Step 4.4: Push migrations to the Test Supabase project**

```bash
npx supabase link --project-ref <test-project-ref>
npx supabase db push
```

Verify the same way against `TEST_DATABASE_URL`.

- [ ] **Step 4.5: Re-link to Dev** (so subsequent `supabase` commands default to Dev unless re-linked)

```bash
npx supabase link --project-ref <dev-project-ref>
```

- [ ] **Step 4.6: Commit**

```bash
git add supabase/
git commit -m "chore(supabase): init config, seed system_settings singleton, push schema to dev + test projects"
```

> **Production migrations:** Deliberately not pushed in this task. Task 21 (Vercel deployment readiness) covers promoting migrations to Prod after Phase 1 is verified end-to-end.

---

### Task 5: JWT Custom Access Token Hook for role injection

**Files:**
- Create: `supabase/migrations/<timestamp>_jwt_custom_claim_hook.sql`

The hook is a Postgres function that Supabase Auth invokes at token issuance. It reads the user's role from `app_user` and writes it into `app_metadata.role` in the issued JWT.

- [ ] **Step 5.1: Write the migration**

Create `supabase/migrations/<next-timestamp>_jwt_custom_claim_hook.sql`:

```sql
-- Custom Access Token Hook: inject role from app_user into JWT app_metadata
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  claims jsonb;
  user_role text;
BEGIN
  -- Look up the user's role
  SELECT role::text INTO user_role
  FROM public.app_user
  WHERE id = (event->>'user_id')::uuid;

  -- Read the existing claims object
  claims := event->'claims';

  -- Inject role under app_metadata.role (RLS reads from auth.jwt()->'app_metadata'->'role')
  IF user_role IS NOT NULL THEN
    claims := jsonb_set(claims, '{app_metadata,role}', to_jsonb(user_role));
  ELSE
    -- No app_user row: omit the role claim (RLS will deny everything)
    claims := jsonb_set(claims, '{app_metadata,role}', 'null'::jsonb);
  END IF;

  -- Update the event and return it
  event := jsonb_set(event, '{claims}', claims);
  RETURN event;
END;
$$;

-- Grant Supabase Auth permission to call the function
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO supabase_auth_admin;
GRANT SELECT ON public.app_user TO supabase_auth_admin;

-- Revoke from less-privileged roles
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) FROM authenticated, anon, public;
```

- [ ] **Step 5.2: Register the hook in `supabase/config.toml`**

Edit `supabase/config.toml`, find the `[auth.hook.custom_access_token]` section (or add it), and set:

```toml
[auth.hook.custom_access_token]
enabled = true
uri = "pg-functions://postgres/public/custom_access_token_hook"
```

- [ ] **Step 5.3: Apply and verify**

```bash
npx supabase db reset
```

Then in `psql $DATABASE_URL`:
```sql
SELECT proname FROM pg_proc WHERE proname = 'custom_access_token_hook';
```
Expected: one row.

- [ ] **Step 5.4: Commit**

```bash
git add supabase/
git commit -m "feat(auth): JWT custom access token hook injecting role into app_metadata"
```

---

### Task 6: RLS policies for v1 tables

**Files:**
- Create: `supabase/migrations/<next-timestamp>_rls_policies.sql`

Per spec §3 RLS strategy.

- [ ] **Step 6.1: Write the migration**

Create `supabase/migrations/<next-timestamp>_rls_policies.sql`:

```sql
-- Helper: read role from JWT
CREATE OR REPLACE FUNCTION public.current_role()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT auth.jwt() -> 'app_metadata' ->> 'role';
$$;

-- ── Enable RLS on every v1 table ────────────────────────────────────────
ALTER TABLE public.app_user        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lot             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lot_photo       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log       ENABLE ROW LEVEL SECURITY;

-- ── app_user: admin-only read/write ─────────────────────────────────────
CREATE POLICY app_user_admin_select ON public.app_user FOR SELECT
  USING (public.current_role() = 'admin');
CREATE POLICY app_user_admin_modify ON public.app_user FOR ALL
  USING (public.current_role() = 'admin')
  WITH CHECK (public.current_role() = 'admin');

-- ── customer: SELECT all authenticated; mutations admin/office; DELETE admin
CREATE POLICY customer_select ON public.customer FOR SELECT
  USING (public.current_role() IN ('admin', 'office', 'warehouse'));
CREATE POLICY customer_insert ON public.customer FOR INSERT
  WITH CHECK (public.current_role() IN ('admin', 'office'));
CREATE POLICY customer_update ON public.customer FOR UPDATE
  USING (public.current_role() IN ('admin', 'office'))
  WITH CHECK (public.current_role() IN ('admin', 'office'));
CREATE POLICY customer_delete ON public.customer FOR DELETE
  USING (public.current_role() = 'admin');

-- ── job: same shape as customer ─────────────────────────────────────────
CREATE POLICY job_select ON public.job FOR SELECT
  USING (public.current_role() IN ('admin', 'office', 'warehouse'));
CREATE POLICY job_insert ON public.job FOR INSERT
  WITH CHECK (public.current_role() IN ('admin', 'office'));
CREATE POLICY job_update ON public.job FOR UPDATE
  USING (public.current_role() IN ('admin', 'office'))
  WITH CHECK (public.current_role() IN ('admin', 'office'));
CREATE POLICY job_delete ON public.job FOR DELETE
  USING (public.current_role() = 'admin');

-- ── lot, lot_photo: SELECT/INSERT all authenticated; UPDATE blocked when frozen; DELETE admin
-- (Phase 2/4 will add INSERT/UPDATE policies; for Phase 1 just open SELECT.)
CREATE POLICY lot_select ON public.lot FOR SELECT
  USING (public.current_role() IN ('admin', 'office', 'warehouse'));
CREATE POLICY lot_insert ON public.lot FOR INSERT
  WITH CHECK (public.current_role() IN ('admin', 'office', 'warehouse'));
CREATE POLICY lot_update ON public.lot FOR UPDATE
  USING (
    public.current_role() IN ('admin', 'office', 'warehouse')
    AND state IN ('assigned', 'unassigned', 'sold')
  )
  WITH CHECK (
    public.current_role() IN ('admin', 'office', 'warehouse')
    AND state IN ('assigned', 'unassigned', 'sold')
  );
CREATE POLICY lot_delete ON public.lot FOR DELETE
  USING (public.current_role() = 'admin');

CREATE POLICY lot_photo_select ON public.lot_photo FOR SELECT
  USING (public.current_role() IN ('admin', 'office', 'warehouse'));
CREATE POLICY lot_photo_insert ON public.lot_photo FOR INSERT
  WITH CHECK (public.current_role() IN ('admin', 'office', 'warehouse'));
CREATE POLICY lot_photo_update ON public.lot_photo FOR UPDATE
  USING (public.current_role() IN ('admin', 'office', 'warehouse'))
  WITH CHECK (public.current_role() IN ('admin', 'office', 'warehouse'));
CREATE POLICY lot_photo_delete ON public.lot_photo FOR DELETE
  USING (public.current_role() = 'admin');

-- ── system_settings: SELECT all authenticated; UPDATE admin
CREATE POLICY system_settings_select ON public.system_settings FOR SELECT
  USING (public.current_role() IN ('admin', 'office', 'warehouse'));
CREATE POLICY system_settings_update ON public.system_settings FOR UPDATE
  USING (public.current_role() = 'admin')
  WITH CHECK (public.current_role() = 'admin');

-- ── audit_log: admin-only SELECT; INSERT only via SECURITY DEFINER trigger
CREATE POLICY audit_log_admin_select ON public.audit_log FOR SELECT
  USING (public.current_role() = 'admin');
-- No INSERT/UPDATE/DELETE policies → only SECURITY DEFINER functions can write
```

- [ ] **Step 6.2: Apply and verify**

```bash
npx supabase db reset
psql $DATABASE_URL -c "SELECT tablename, policyname FROM pg_policies WHERE schemaname='public' ORDER BY tablename, policyname;"
```
Expected: policies for every v1 table listed.

- [ ] **Step 6.3: Commit**

```bash
git add supabase/
git commit -m "feat(rls): row-level security policies for all v1 tables per spec §3"
```

---

### Task 7: Audit-log triggers on tracked tables

**Files:**
- Create: `supabase/migrations/<next-timestamp>_audit_log_triggers.sql`

Per spec §11. Tracked tables: `lot`, `customer`, `job`, `app_user`. Trigger writes a row to `audit_log` with full diff.

- [ ] **Step 7.1: Write the migration**

```sql
-- Trigger function: write a row to audit_log on any insert/update/delete
CREATE OR REPLACE FUNCTION public.audit_log_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid;
  v_change_type audit_change_type;
  v_record_id uuid;
  v_changed jsonb;
BEGIN
  -- Identify the actor from the JWT subject; null on system inserts
  v_actor := NULLIF(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid);

  IF TG_OP = 'INSERT' THEN
    v_change_type := 'insert';
    v_record_id := (row_to_json(NEW)->>'id')::uuid;
    v_changed := jsonb_build_object('new', to_jsonb(NEW));
  ELSIF TG_OP = 'UPDATE' THEN
    v_change_type := 'update';
    v_record_id := (row_to_json(NEW)->>'id')::uuid;
    v_changed := jsonb_build_object('old', to_jsonb(OLD), 'new', to_jsonb(NEW));
  ELSIF TG_OP = 'DELETE' THEN
    v_change_type := 'delete';
    v_record_id := (row_to_json(OLD)->>'id')::uuid;
    v_changed := jsonb_build_object('old', to_jsonb(OLD));
  END IF;

  INSERT INTO public.audit_log (table_name, record_id, change_type, changed_fields, changed_by)
  VALUES (TG_TABLE_NAME, v_record_id, v_change_type, v_changed, v_actor);

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Attach to tracked tables
CREATE TRIGGER audit_lot       AFTER INSERT OR UPDATE OR DELETE ON public.lot       FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();
CREATE TRIGGER audit_customer  AFTER INSERT OR UPDATE OR DELETE ON public.customer  FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();
CREATE TRIGGER audit_job       AFTER INSERT OR UPDATE OR DELETE ON public.job       FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();
CREATE TRIGGER audit_app_user  AFTER INSERT OR UPDATE OR DELETE ON public.app_user  FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();
```

- [ ] **Step 7.2: Apply and verify**

```bash
npx supabase db reset
psql $DATABASE_URL -c "SELECT trigger_name, event_object_table FROM information_schema.triggers WHERE trigger_schema='public';"
```
Expected: 4 triggers (`audit_lot`, `audit_customer`, `audit_job`, `audit_app_user`).

- [ ] **Step 7.3: Commit**

```bash
git add supabase/
git commit -m "feat(audit): postgres triggers writing to audit_log on changes to tracked tables"
```

---

### Task 8: Initial admin seed script

**Files:**
- Create: `scripts/seed-admin.ts`

- [ ] **Step 8.1: Write the seed script**

```ts
// scripts/seed-admin.ts
import { createClient } from '@supabase/supabase-js';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq } from 'drizzle-orm';
import { appUser } from '../db/schema';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DB_URL = process.env.DATABASE_URL;
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@auction-os.local';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'admin1234!';
const ADMIN_NAME = process.env.SEED_ADMIN_NAME ?? 'Initial Admin';

if (!SUPABASE_URL || !SERVICE_KEY || !DB_URL) {
  console.error('Missing env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DATABASE_URL required');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const db = drizzle(postgres(DB_URL, { prepare: false }));

async function main() {
  // 1. Create the auth user (or fetch if it exists)
  const { data: created, error: createErr } = await supabase.auth.admin.createUser({
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    email_confirm: true,
  });

  let userId: string;
  if (createErr && createErr.message.includes('already')) {
    const { data: list } = await supabase.auth.admin.listUsers();
    const existing = list.users.find((u) => u.email === ADMIN_EMAIL);
    if (!existing) throw new Error('Admin user supposedly exists but cannot be located');
    userId = existing.id;
    console.log(`Reusing existing auth user ${userId}`);
  } else if (createErr) {
    throw createErr;
  } else {
    userId = created.user!.id;
    console.log(`Created auth user ${userId}`);
  }

  // 2. Upsert the app_user row with role=admin
  await db
    .insert(appUser)
    .values({ id: userId, role: 'admin', displayName: ADMIN_NAME })
    .onConflictDoUpdate({ target: appUser.id, set: { role: 'admin', displayName: ADMIN_NAME } });

  console.log(`Seeded admin: ${ADMIN_EMAIL}`);
  console.log(`Password: ${ADMIN_PASSWORD}`);
  console.log('Change this password before any deployment to a shared environment.');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 8.2: Run it and verify**

```bash
npm run seed:admin
```

Expected: prints a user ID and the seeded credentials. Verify:

```bash
psql $DATABASE_URL -c "SELECT id, role, display_name FROM app_user;"
```
Expected: one row with role=`admin`.

- [ ] **Step 8.3: Commit**

```bash
git add scripts/seed-admin.ts
git commit -m "feat(scripts): seed-admin script for initial admin provisioning"
```

---

### Task 9: Hono API scaffold + auth middleware

**Files:**
- Create: `api/_app.ts`, `api/_lib/db.ts`, `api/_lib/responses.ts`, `api/_middleware/auth.ts`, `api/health.ts`, `vercel.ts`

- [ ] **Step 9.1: Create `api/_lib/db.ts`** (request-scoped Drizzle client)

```ts
// api/_lib/db.ts
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../../db/schema';

let _client: ReturnType<typeof postgres> | null = null;

export function getDb() {
  if (!_client) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL not set');
    _client = postgres(url, { prepare: false, max: 1 });
  }
  return drizzle(_client, { schema });
}
```

- [ ] **Step 9.2: Create `api/_lib/responses.ts`**

```ts
// api/_lib/responses.ts
import type { Context } from 'hono';

export function jsonError(c: Context, status: number, code: string, message: string) {
  return c.json({ error: { code, message } }, status as 400 | 401 | 403 | 404 | 409 | 500);
}
```

- [ ] **Step 9.3: Create `api/_middleware/auth.ts`** (verifies Supabase JWT via ES256 + JWKS)

> **Note:** Modern Supabase signs JWTs with **ES256 (asymmetric)** and publishes the public key at `<SUPABASE_URL>/auth/v1/.well-known/jwks.json`. We use `jose.createRemoteJWKSet` to fetch and cache that public key automatically — no shared `JWT_SECRET` is needed or stored anywhere.

```ts
// api/_middleware/auth.ts
import { createMiddleware } from 'hono/factory';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { jsonError } from '../_lib/responses';

export type AuthContext = {
  Variables: {
    userId: string;
    role: 'admin' | 'office' | 'warehouse';
  };
};

// Lazily initialize the JWKS set from SUPABASE_URL on first verification.
// jose caches keys and refreshes them automatically on rotation.
let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
function getJwks() {
  if (!jwks) {
    const url = process.env.SUPABASE_URL;
    if (!url) throw new Error('SUPABASE_URL not set');
    jwks = createRemoteJWKSet(new URL(`${url}/auth/v1/.well-known/jwks.json`));
  }
  return jwks;
}

export const authMiddleware = createMiddleware<AuthContext>(async (c, next) => {
  const header = c.req.header('Authorization');
  if (!header?.startsWith('Bearer ')) {
    return jsonError(c, 401, 'UNAUTHENTICATED', 'Missing bearer token');
  }
  const token = header.slice(7);

  try {
    const { payload } = await jwtVerify(token, getJwks(), { algorithms: ['ES256'] });
    const userId = payload.sub;
    const role = (payload as any).app_metadata?.role;
    if (!userId || !role) {
      return jsonError(c, 401, 'INVALID_TOKEN', 'Token is missing required claims');
    }
    c.set('userId', userId);
    c.set('role', role);
    await next();
  } catch {
    return jsonError(c, 401, 'INVALID_TOKEN', 'Token verification failed');
  }
});

export function requireRole(...allowed: Array<'admin' | 'office' | 'warehouse'>) {
  return createMiddleware<AuthContext>(async (c, next) => {
    const role = c.get('role');
    if (!allowed.includes(role)) {
      return jsonError(c, 403, 'FORBIDDEN', `Role ${role} cannot perform this action`);
    }
    await next();
  });
}
```

`jose` is already in `package.json` dependencies from Task 1.2 — no additional install needed.

- [ ] **Step 9.4: Create `api/_app.ts`** (Hono app factory; mounted by individual route files)

```ts
// api/_app.ts
import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { cors } from 'hono/cors';
import type { AuthContext } from './_middleware/auth';

export function createApp() {
  const app = new Hono<AuthContext>();
  app.use('*', logger());
  app.use('*', cors({ origin: ['http://localhost:5173'], credentials: true }));
  return app;
}
```

- [ ] **Step 9.5: Create `api/health.ts`** (no auth — sanity check endpoint)

```ts
// api/health.ts
import { handle } from 'hono/vercel';
import { createApp } from './_app';

const app = createApp();
app.get('/api/health', (c) => c.json({ ok: true, ts: new Date().toISOString() }));

export default handle(app);
export const config = { runtime: 'nodejs' };
```

- [ ] **Step 9.6: Create `vercel.ts`** (per knowledge update — replaces `vercel.json`)

```ts
// vercel.ts
import type { VercelConfig } from '@vercel/config/v1';

export const config: VercelConfig = {
  framework: 'vite',
  buildCommand: 'npm run build',
  outputDirectory: 'dist',
  functions: {
    'api/**/*.ts': {
      runtime: 'nodejs',
      memory: 1024,
      maxDuration: 60,
    },
  },
};
```

Add `@vercel/config` to dev dependencies: `npm install -D @vercel/config`.

- [ ] **Step 9.7: Smoke test the health endpoint**

Run: `npm run dev` (Vite) and in another terminal `npx vercel dev` (Vercel functions).
Expected: `curl http://localhost:3000/api/health` returns `{"ok":true,"ts":"..."}`.

- [ ] **Step 9.8: Commit**

```bash
git add api/ vercel.ts package.json
git commit -m "feat(api): hono on vercel functions scaffold + auth middleware + /api/health"
```

---

### Task 10: Test infrastructure (Vitest + test DB helpers)

**Files:**
- Create: `tests/helpers/test-db.ts`, `tests/helpers/test-jwt.ts`, `vitest.config.ts`

- [ ] **Step 10.1: Create `vitest.config.ts`**

```ts
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
```

- [ ] **Step 10.2: Create `tests/helpers/setup.ts`** (global setup — load test env, install test JWKS)

```ts
// tests/helpers/setup.ts
import { config } from 'dotenv';
import { setJwksForTesting } from '../../api/_middleware/auth';
import { getTestKeys } from './test-jwt';

// Load .env.test (Test Supabase project) instead of .env (Dev project)
config({ path: '.env.test' });

// Inject a local JWKS into the auth middleware so tests can mint and verify
// their own ES256-signed tokens without hitting Supabase's JWKS endpoint.
const { jwks } = await getTestKeys();
setJwksForTesting(jwks);
```

`dotenv` is already in package.json devDependencies from Task 1.2.

- [ ] **Step 10.3: Create `tests/helpers/test-db.ts`**

```ts
// tests/helpers/test-db.ts
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../../db/schema';
import { sql } from 'drizzle-orm';

const url = process.env.DATABASE_URL!;
const client = postgres(url, { prepare: false, max: 1 });
export const testDb = drizzle(client, { schema });

export async function truncateAll() {
  await testDb.execute(sql`
    TRUNCATE TABLE
      audit_log, lot_photo, lot, job, customer, app_user, system_settings
    RESTART IDENTITY CASCADE
  `);
  // Restore singleton
  await testDb.execute(sql`INSERT INTO system_settings (id) VALUES (1) ON CONFLICT DO NOTHING`);
}
```

- [ ] **Step 10.4: Create `tests/helpers/test-jwt.ts`** (generates ES256 keypair + mints role-stamped JWTs)

```ts
// tests/helpers/test-jwt.ts
// Generates a per-test-run ES256 keypair, exposes the public JWKS for the
// auth middleware to use, and signs tokens with the matching private key.
import { SignJWT, generateKeyPair, exportJWK, createLocalJWKSet, type KeyLike } from 'jose';

let cached: { privateKey: KeyLike; jwks: ReturnType<typeof createLocalJWKSet> } | null = null;

export async function getTestKeys() {
  if (!cached) {
    const { privateKey, publicKey } = await generateKeyPair('ES256');
    const publicJwk = await exportJWK(publicKey);
    publicJwk.kid = 'test';
    publicJwk.alg = 'ES256';
    publicJwk.use = 'sig';
    const jwks = createLocalJWKSet({ keys: [publicJwk as any] });
    cached = { privateKey, jwks };
  }
  return cached;
}

export async function mintTestJwt(opts: { userId: string; role: 'admin' | 'office' | 'warehouse' }) {
  const { privateKey } = await getTestKeys();
  return new SignJWT({ app_metadata: { role: opts.role } })
    .setProtectedHeader({ alg: 'ES256', kid: 'test' })
    .setSubject(opts.userId)
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(privateKey);
}
```

This pairs with the `setJwksForTesting()` hook on the auth middleware. To make that hook exist, **also add a small export to `api/_middleware/auth.ts`** at the bottom of the file (after the `requireRole` export, before the file ends):

```ts
// Test-only escape hatch: override the JWKS used for verification.
// Called by tests/helpers/setup.ts. Has no effect in production.
export function setJwksForTesting(testJwks: any) {
  jwks = testJwks;
}
```

- [ ] **Step 10.5: Write a smoke test for the helper**

`tests/helpers/test-db.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { testDb, truncateAll } from './test-db';
import { customer } from '../../db/schema';

describe('test-db helper', () => {
  beforeEach(async () => { await truncateAll(); });

  it('starts each test with empty tables', async () => {
    const rows = await testDb.select().from(customer);
    expect(rows).toEqual([]);
  });
});
```

- [ ] **Step 10.6: Run and verify**

Run: `npm test`
Expected: 1 passing test.

- [ ] **Step 10.7: Commit**

```bash
git add tests/ vitest.config.ts package.json
git commit -m "test(infra): vitest config + DB truncate helper + JWT minter"
```

---

### Task 11: Customer CRUD endpoints (TDD)

**Files:**
- Create: `api/customers/index.ts`, `api/customers/[id].ts`, `tests/api/customers.test.ts`, `shared/types.ts`

- [ ] **Step 11.1: Define shared types**

`shared/types.ts`:
```ts
// shared/types.ts
export type CustomerDTO = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export type CreateCustomerRequest = { name: string };
export type UpdateCustomerRequest = { name?: string };

export type ApiError = { error: { code: string; message: string } };
```

- [ ] **Step 11.2: Write the failing test**

`tests/api/customers.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { testDb, truncateAll } from '../helpers/test-db';
import { mintTestJwt } from '../helpers/test-jwt';
import { appUser } from '../../db/schema';
import handler from '../../api/customers/index';

const ADMIN = '00000000-0000-0000-0000-000000000001';
const OFFICE = '00000000-0000-0000-0000-000000000002';
const WAREHOUSE = '00000000-0000-0000-0000-000000000003';

async function seedUsers() {
  await testDb.insert(appUser).values([
    { id: ADMIN, role: 'admin', displayName: 'Admin' },
    { id: OFFICE, role: 'office', displayName: 'Office' },
    { id: WAREHOUSE, role: 'warehouse', displayName: 'Warehouse' },
  ]);
}

async function call(method: string, body: unknown, role: 'admin' | 'office' | 'warehouse', userId: string) {
  const token = await mintTestJwt({ userId, role });
  const req = new Request('http://test/api/customers', {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  return handler(req);
}

describe('POST /api/customers', () => {
  beforeEach(async () => {
    await truncateAll();
    await seedUsers();
  });

  it('admin can create a customer', async () => {
    const res = await call('POST', { name: 'Smith Estate' }, 'admin', ADMIN);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.name).toBe('Smith Estate');
    expect(body.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('office can create a customer', async () => {
    const res = await call('POST', { name: 'Jones Family' }, 'office', OFFICE);
    expect(res.status).toBe(201);
  });

  it('warehouse cannot create a customer', async () => {
    const res = await call('POST', { name: 'Nope' }, 'warehouse', WAREHOUSE);
    expect(res.status).toBe(403);
  });

  it('rejects empty name', async () => {
    const res = await call('POST', { name: '' }, 'admin', ADMIN);
    expect(res.status).toBe(400);
  });

  it('rejects missing auth', async () => {
    const req = new Request('http://test/api/customers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'X' }),
    });
    const res = await handler(req);
    expect(res.status).toBe(401);
  });
});

describe('GET /api/customers', () => {
  beforeEach(async () => {
    await truncateAll();
    await seedUsers();
  });

  it('lists customers for any authenticated role', async () => {
    await call('POST', { name: 'A' }, 'admin', ADMIN);
    await call('POST', { name: 'B' }, 'admin', ADMIN);
    const res = await call('GET', null, 'warehouse', WAREHOUSE);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.customers).toHaveLength(2);
    expect(body.customers.map((c: any) => c.name).sort()).toEqual(['A', 'B']);
  });
});
```

- [ ] **Step 11.3: Run the test to verify it fails**

Run: `npm test -- customers`
Expected: FAIL — handler module not found.

- [ ] **Step 11.4: Implement `api/customers/index.ts`**

```ts
// api/customers/index.ts
import { handle } from 'hono/vercel';
import { z } from 'zod';
import { createApp } from '../_app';
import { authMiddleware, requireRole } from '../_middleware/auth';
import { getDb } from '../_lib/db';
import { customer } from '../../db/schema';
import { jsonError } from '../_lib/responses';

const app = createApp();
app.use('/api/customers/*', authMiddleware);
app.use('/api/customers', authMiddleware);

const CreateSchema = z.object({ name: z.string().min(1).max(200) });

app.get('/api/customers', async (c) => {
  const db = getDb();
  const rows = await db.select().from(customer).orderBy(customer.createdAt);
  return c.json({ customers: rows });
});

app.post('/api/customers', requireRole('admin', 'office'), async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(c, 400, 'INVALID_BODY', parsed.error.issues[0].message);
  }
  const db = getDb();
  const [row] = await db.insert(customer).values({ name: parsed.data.name }).returning();
  return c.json(row, 201);
});

const handler = handle(app);
export default handler;
export const config = { runtime: 'nodejs' };
```

- [ ] **Step 11.5: Run the test to verify it passes**

Run: `npm test -- customers`
Expected: All POST/GET cases PASS.

- [ ] **Step 11.6: Add the per-id route**

`api/customers/[id].ts`:
```ts
// api/customers/[id].ts
import { handle } from 'hono/vercel';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { createApp } from '../_app';
import { authMiddleware, requireRole } from '../_middleware/auth';
import { getDb } from '../_lib/db';
import { customer } from '../../db/schema';
import { jsonError } from '../_lib/responses';

const app = createApp();
app.use('/api/customers/:id', authMiddleware);

const UpdateSchema = z.object({ name: z.string().min(1).max(200).optional() });

app.get('/api/customers/:id', async (c) => {
  const id = c.req.param('id');
  const db = getDb();
  const [row] = await db.select().from(customer).where(eq(customer.id, id));
  if (!row) return jsonError(c, 404, 'NOT_FOUND', 'Customer not found');
  return c.json(row);
});

app.patch('/api/customers/:id', requireRole('admin', 'office'), async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => null);
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) return jsonError(c, 400, 'INVALID_BODY', parsed.error.issues[0].message);
  const db = getDb();
  const [row] = await db.update(customer).set({ ...parsed.data, updatedAt: new Date() }).where(eq(customer.id, id)).returning();
  if (!row) return jsonError(c, 404, 'NOT_FOUND', 'Customer not found');
  return c.json(row);
});

app.delete('/api/customers/:id', requireRole('admin'), async (c) => {
  const id = c.req.param('id');
  const db = getDb();
  const [row] = await db.delete(customer).where(eq(customer.id, id)).returning();
  if (!row) return jsonError(c, 404, 'NOT_FOUND', 'Customer not found');
  return c.json({ ok: true });
});

export default handle(app);
export const config = { runtime: 'nodejs' };
```

- [ ] **Step 11.7: Add tests for `[id].ts`** (GET, PATCH, DELETE permission cases)

Append to `tests/api/customers.test.ts`:
```ts
import idHandler from '../../api/customers/[id]';

async function callId(id: string, method: string, body: unknown, role: 'admin' | 'office' | 'warehouse', userId: string) {
  const token = await mintTestJwt({ userId, role });
  return idHandler(new Request(`http://test/api/customers/${id}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  }));
}

describe('PATCH /api/customers/:id', () => {
  beforeEach(async () => { await truncateAll(); await seedUsers(); });

  it('admin updates name', async () => {
    const created = await (await call('POST', { name: 'Old' }, 'admin', ADMIN)).json();
    const res = await callId(created.id, 'PATCH', { name: 'New' }, 'admin', ADMIN);
    expect(res.status).toBe(200);
    expect((await res.json()).name).toBe('New');
  });

  it('warehouse cannot update', async () => {
    const created = await (await call('POST', { name: 'X' }, 'admin', ADMIN)).json();
    const res = await callId(created.id, 'PATCH', { name: 'Y' }, 'warehouse', WAREHOUSE);
    expect(res.status).toBe(403);
  });
});

describe('DELETE /api/customers/:id', () => {
  beforeEach(async () => { await truncateAll(); await seedUsers(); });

  it('admin deletes', async () => {
    const created = await (await call('POST', { name: 'X' }, 'admin', ADMIN)).json();
    const res = await callId(created.id, 'DELETE', null, 'admin', ADMIN);
    expect(res.status).toBe(200);
  });

  it('office cannot delete', async () => {
    const created = await (await call('POST', { name: 'X' }, 'admin', ADMIN)).json();
    const res = await callId(created.id, 'DELETE', null, 'office', OFFICE);
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 11.8: Run all tests and commit**

Run: `npm test -- customers`
Expected: all PASS.

```bash
git add api/customers tests/api/customers.test.ts shared/types.ts
git commit -m "feat(api): customer CRUD endpoints with role-based access"
```

---

### Task 12: Job CRUD endpoints (TDD)

**Files:**
- Create: `api/jobs/index.ts`, `api/jobs/[id].ts`, `tests/api/jobs.test.ts`

Mirror Task 11's structure. Job is owned by Customer; supports `closed_at` toggle (close/reopen via PATCH).

- [ ] **Step 12.1: Write failing tests**

`tests/api/jobs.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { testDb, truncateAll } from '../helpers/test-db';
import { mintTestJwt } from '../helpers/test-jwt';
import { appUser, customer as customerTable } from '../../db/schema';
import indexHandler from '../../api/jobs/index';
import idHandler from '../../api/jobs/[id]';

const ADMIN = '00000000-0000-0000-0000-000000000001';
const WAREHOUSE = '00000000-0000-0000-0000-000000000003';

async function seedUsersAndCustomer() {
  await testDb.insert(appUser).values([
    { id: ADMIN, role: 'admin', displayName: 'Admin' },
    { id: WAREHOUSE, role: 'warehouse', displayName: 'Warehouse' },
  ]);
  const [c] = await testDb.insert(customerTable).values({ name: 'Smith Estate' }).returning();
  return c.id;
}

async function call(handler: any, url: string, method: string, body: unknown, role: 'admin' | 'office' | 'warehouse', userId: string) {
  const token = await mintTestJwt({ userId, role });
  return handler(new Request(`http://test${url}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  }));
}

describe('POST /api/jobs', () => {
  let customerId: string;
  beforeEach(async () => { await truncateAll(); customerId = await seedUsersAndCustomer(); });

  it('admin creates a job for a customer', async () => {
    const res = await call(indexHandler, '/api/jobs', 'POST', { customerId, jobNumber: '2026-04-Smith-001' }, 'admin', ADMIN);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.jobNumber).toBe('2026-04-Smith-001');
    expect(body.customerId).toBe(customerId);
    expect(body.closedAt).toBeNull();
  });

  it('rejects duplicate (customerId, jobNumber)', async () => {
    await call(indexHandler, '/api/jobs', 'POST', { customerId, jobNumber: 'X' }, 'admin', ADMIN);
    const res = await call(indexHandler, '/api/jobs', 'POST', { customerId, jobNumber: 'X' }, 'admin', ADMIN);
    expect(res.status).toBe(409);
  });

  it('warehouse cannot create', async () => {
    const res = await call(indexHandler, '/api/jobs', 'POST', { customerId, jobNumber: 'Y' }, 'warehouse', WAREHOUSE);
    expect(res.status).toBe(403);
  });
});

describe('GET /api/jobs?customerId=...', () => {
  let customerId: string;
  beforeEach(async () => { await truncateAll(); customerId = await seedUsersAndCustomer(); });

  it('lists jobs filtered by customerId', async () => {
    await call(indexHandler, '/api/jobs', 'POST', { customerId, jobNumber: 'A' }, 'admin', ADMIN);
    await call(indexHandler, '/api/jobs', 'POST', { customerId, jobNumber: 'B' }, 'admin', ADMIN);
    const res = await call(indexHandler, `/api/jobs?customerId=${customerId}`, 'GET', null, 'warehouse', WAREHOUSE);
    expect(res.status).toBe(200);
    expect((await res.json()).jobs).toHaveLength(2);
  });
});

describe('PATCH /api/jobs/:id (close/reopen)', () => {
  let customerId: string;
  beforeEach(async () => { await truncateAll(); customerId = await seedUsersAndCustomer(); });

  it('admin closes a job', async () => {
    const created = await (await call(indexHandler, '/api/jobs', 'POST', { customerId, jobNumber: 'C' }, 'admin', ADMIN)).json();
    const res = await call(idHandler, `/api/jobs/${created.id}`, 'PATCH', { closed: true }, 'admin', ADMIN);
    expect(res.status).toBe(200);
    expect((await res.json()).closedAt).not.toBeNull();
  });

  it('admin reopens a job', async () => {
    const created = await (await call(indexHandler, '/api/jobs', 'POST', { customerId, jobNumber: 'D' }, 'admin', ADMIN)).json();
    await call(idHandler, `/api/jobs/${created.id}`, 'PATCH', { closed: true }, 'admin', ADMIN);
    const res = await call(idHandler, `/api/jobs/${created.id}`, 'PATCH', { closed: false }, 'admin', ADMIN);
    expect(res.status).toBe(200);
    expect((await res.json()).closedAt).toBeNull();
  });
});
```

- [ ] **Step 12.2: Run to verify failing**

Run: `npm test -- jobs`
Expected: handlers not found.

- [ ] **Step 12.3: Implement `api/jobs/index.ts`**

```ts
// api/jobs/index.ts
import { handle } from 'hono/vercel';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { createApp } from '../_app';
import { authMiddleware, requireRole } from '../_middleware/auth';
import { getDb } from '../_lib/db';
import { job } from '../../db/schema';
import { jsonError } from '../_lib/responses';

const app = createApp();
app.use('/api/jobs', authMiddleware);

const CreateSchema = z.object({
  customerId: z.string().uuid(),
  jobNumber: z.string().min(1).max(200),
});

app.get('/api/jobs', async (c) => {
  const customerId = c.req.query('customerId');
  const db = getDb();
  const rows = customerId
    ? await db.select().from(job).where(eq(job.customerId, customerId))
    : await db.select().from(job);
  return c.json({ jobs: rows });
});

app.post('/api/jobs', requireRole('admin', 'office'), async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return jsonError(c, 400, 'INVALID_BODY', parsed.error.issues[0].message);

  const db = getDb();
  try {
    const [row] = await db.insert(job).values(parsed.data).returning();
    return c.json(row, 201);
  } catch (err: any) {
    if (err.code === '23505') return jsonError(c, 409, 'DUPLICATE_JOB_NUMBER', 'A job with that number already exists for this customer');
    throw err;
  }
});

export default handle(app);
export const config = { runtime: 'nodejs' };
```

- [ ] **Step 12.4: Implement `api/jobs/[id].ts`**

```ts
// api/jobs/[id].ts
import { handle } from 'hono/vercel';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { createApp } from '../_app';
import { authMiddleware, requireRole } from '../_middleware/auth';
import { getDb } from '../_lib/db';
import { job } from '../../db/schema';
import { jsonError } from '../_lib/responses';

const app = createApp();
app.use('/api/jobs/:id', authMiddleware);

const PatchSchema = z.object({
  jobNumber: z.string().min(1).max(200).optional(),
  closed: z.boolean().optional(),
});

app.get('/api/jobs/:id', async (c) => {
  const db = getDb();
  const [row] = await db.select().from(job).where(eq(job.id, c.req.param('id')));
  if (!row) return jsonError(c, 404, 'NOT_FOUND', 'Job not found');
  return c.json(row);
});

app.patch('/api/jobs/:id', requireRole('admin', 'office'), async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => null);
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) return jsonError(c, 400, 'INVALID_BODY', parsed.error.issues[0].message);

  const update: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.data.jobNumber !== undefined) update.jobNumber = parsed.data.jobNumber;
  if (parsed.data.closed !== undefined) update.closedAt = parsed.data.closed ? new Date() : null;

  const db = getDb();
  const [row] = await db.update(job).set(update).where(eq(job.id, id)).returning();
  if (!row) return jsonError(c, 404, 'NOT_FOUND', 'Job not found');
  return c.json(row);
});

app.delete('/api/jobs/:id', requireRole('admin'), async (c) => {
  const db = getDb();
  const [row] = await db.delete(job).where(eq(job.id, c.req.param('id'))).returning();
  if (!row) return jsonError(c, 404, 'NOT_FOUND', 'Job not found');
  return c.json({ ok: true });
});

export default handle(app);
export const config = { runtime: 'nodejs' };
```

- [ ] **Step 12.5: Run tests and commit**

Run: `npm test -- jobs`
Expected: PASS.

```bash
git add api/jobs tests/api/jobs.test.ts
git commit -m "feat(api): job CRUD endpoints with closed_at toggle and unique-per-customer constraint"
```

---

### Task 13: User management endpoints (admin only) (TDD)

**Files:**
- Create: `api/users/index.ts`, `api/users/[id].ts`, `tests/api/users.test.ts`

Endpoints:
- `GET /api/users` (admin only) — list app_user rows joined with auth.users for email
- `POST /api/users` (admin only) — create both an auth.users row and an app_user row in one transaction (uses Supabase service-role client)
- `PATCH /api/users/:id` (admin only) — change role and/or display_name; toggle disabled

- [ ] **Step 13.1: Write failing tests**

`tests/api/users.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { testDb, truncateAll } from '../helpers/test-db';
import { mintTestJwt } from '../helpers/test-jwt';
import { appUser } from '../../db/schema';
import indexHandler from '../../api/users/index';
import idHandler from '../../api/users/[id]';

const ADMIN = '00000000-0000-0000-0000-000000000001';
const OFFICE = '00000000-0000-0000-0000-000000000002';

async function seedUsers() {
  await testDb.insert(appUser).values([
    { id: ADMIN, role: 'admin', displayName: 'Admin' },
    { id: OFFICE, role: 'office', displayName: 'Office' },
  ]);
}

async function call(handler: any, url: string, method: string, body: unknown, role: 'admin' | 'office' | 'warehouse', userId: string) {
  const token = await mintTestJwt({ userId, role });
  return handler(new Request(`http://test${url}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  }));
}

describe('GET /api/users', () => {
  beforeEach(async () => { await truncateAll(); await seedUsers(); });

  it('admin lists users', async () => {
    const res = await call(indexHandler, '/api/users', 'GET', null, 'admin', ADMIN);
    expect(res.status).toBe(200);
    expect((await res.json()).users).toHaveLength(2);
  });

  it('office is forbidden', async () => {
    const res = await call(indexHandler, '/api/users', 'GET', null, 'office', OFFICE);
    expect(res.status).toBe(403);
  });
});

describe('PATCH /api/users/:id', () => {
  beforeEach(async () => { await truncateAll(); await seedUsers(); });

  it('admin changes role', async () => {
    const res = await call(idHandler, `/api/users/${OFFICE}`, 'PATCH', { role: 'warehouse' }, 'admin', ADMIN);
    expect(res.status).toBe(200);
    expect((await res.json()).role).toBe('warehouse');
  });

  it('office cannot change roles', async () => {
    const res = await call(idHandler, `/api/users/${ADMIN}`, 'PATCH', { role: 'warehouse' }, 'office', OFFICE);
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 13.2: Verify failing**

Run: `npm test -- users`
Expected: handlers not found.

- [ ] **Step 13.3: Implement `api/users/index.ts`**

```ts
// api/users/index.ts
import { handle } from 'hono/vercel';
import { z } from 'zod';
import { createApp } from '../_app';
import { authMiddleware, requireRole } from '../_middleware/auth';
import { getDb } from '../_lib/db';
import { appUser } from '../../db/schema';
import { jsonError } from '../_lib/responses';
import { createClient } from '@supabase/supabase-js';

const app = createApp();
app.use('/api/users', authMiddleware);

const CreateSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(['admin', 'office', 'warehouse']),
  displayName: z.string().min(1).max(200),
});

app.get('/api/users', requireRole('admin'), async (c) => {
  const db = getDb();
  const rows = await db.select().from(appUser).orderBy(appUser.createdAt);
  return c.json({ users: rows });
});

app.post('/api/users', requireRole('admin'), async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return jsonError(c, 400, 'INVALID_BODY', parsed.error.issues[0].message);

  const supabaseUrl = process.env.SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const admin = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  const { data, error } = await admin.auth.admin.createUser({
    email: parsed.data.email,
    password: parsed.data.password,
    email_confirm: true,
  });
  if (error || !data.user) return jsonError(c, 400, 'AUTH_CREATE_FAILED', error?.message ?? 'Failed to create user');

  const db = getDb();
  const [row] = await db.insert(appUser).values({
    id: data.user.id,
    role: parsed.data.role,
    displayName: parsed.data.displayName,
  }).returning();
  return c.json(row, 201);
});

export default handle(app);
export const config = { runtime: 'nodejs' };
```

- [ ] **Step 13.4: Implement `api/users/[id].ts`**

```ts
// api/users/[id].ts
import { handle } from 'hono/vercel';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { createApp } from '../_app';
import { authMiddleware, requireRole } from '../_middleware/auth';
import { getDb } from '../_lib/db';
import { appUser } from '../../db/schema';
import { jsonError } from '../_lib/responses';

const app = createApp();
app.use('/api/users/:id', authMiddleware);

const PatchSchema = z.object({
  role: z.enum(['admin', 'office', 'warehouse']).optional(),
  displayName: z.string().min(1).max(200).optional(),
  disabled: z.boolean().optional(),
});

app.patch('/api/users/:id', requireRole('admin'), async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => null);
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) return jsonError(c, 400, 'INVALID_BODY', parsed.error.issues[0].message);

  const update: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.data.role !== undefined) update.role = parsed.data.role;
  if (parsed.data.displayName !== undefined) update.displayName = parsed.data.displayName;
  if (parsed.data.disabled !== undefined) update.disabledAt = parsed.data.disabled ? new Date() : null;

  const db = getDb();
  const [row] = await db.update(appUser).set(update).where(eq(appUser.id, id)).returning();
  if (!row) return jsonError(c, 404, 'NOT_FOUND', 'User not found');
  return c.json(row);
});

export default handle(app);
export const config = { runtime: 'nodejs' };
```

- [ ] **Step 13.5: Run, commit**

Run: `npm test -- users`
Expected: PASS.

```bash
git add api/users tests/api/users.test.ts
git commit -m "feat(api): user (app_user) management endpoints (admin only)"
```

---

### Task 14: Frontend — Supabase client, auth helpers, API wrapper

**Files:**
- Create: `src/lib/supabase.ts`, `src/lib/auth.ts`, `src/lib/api.ts`

- [ ] **Step 14.1: Create `src/lib/supabase.ts`**

```ts
// src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
if (!url || !anonKey) throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY');

export const supabase = createClient(url, anonKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
});
```

- [ ] **Step 14.2: Create `src/lib/auth.ts`**

```ts
// src/lib/auth.ts
import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import type { Session } from '@supabase/supabase-js';

export type AppRole = 'admin' | 'office' | 'warehouse';

export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  return { session, loading };
}

export function useRole(): AppRole | null {
  const { session } = useSession();
  return ((session?.user.app_metadata as any)?.role as AppRole) ?? null;
}

export async function signIn(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signOut() {
  await supabase.auth.signOut();
}
```

- [ ] **Step 14.3: Create `src/lib/api.ts`**

```ts
// src/lib/api.ts
import { supabase } from './supabase';

const BASE = import.meta.env.VITE_API_BASE_URL ?? '/api';

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
  }
  return res.json();
}
```

- [ ] **Step 14.4: Commit**

```bash
git add src/lib
git commit -m "feat(frontend): supabase client + auth helpers + api fetch wrapper"
```

---

### Task 15: Login page + ProtectedRoute

**Files:**
- Create: `src/routes/Login.tsx`, `src/components/auth/ProtectedRoute.tsx`

- [ ] **Step 15.1: Create `src/routes/Login.tsx`**

```tsx
// src/routes/Login.tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { signIn } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function Login() {
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await signIn(email, password);
      nav('/customers');
    } catch (err: any) {
      setError(err.message ?? 'Login failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-wash p-4">
      <form onSubmit={onSubmit} className="bg-surfaceSolid p-8 rounded-lg shadow-md w-full max-w-md space-y-4 border border-border">
        <h1 className="text-xl font-semibold">Auction OS — Sign in</h1>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
        <Button type="submit" className="w-full" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</Button>
      </form>
    </div>
  );
}
```

- [ ] **Step 15.2: Create `src/components/auth/ProtectedRoute.tsx`**

```tsx
// src/components/auth/ProtectedRoute.tsx
import { Navigate } from 'react-router-dom';
import { useSession, useRole, type AppRole } from '@/lib/auth';

export function ProtectedRoute({ children, allow }: { children: React.ReactNode; allow?: AppRole[] }) {
  const { session, loading } = useSession();
  const role = useRole();
  if (loading) return <div className="p-8 text-textDim">Loading…</div>;
  if (!session) return <Navigate to="/login" replace />;
  if (allow && role && !allow.includes(role)) return <Navigate to="/customers" replace />;
  return <>{children}</>;
}
```

- [ ] **Step 15.3: Commit**

```bash
git add src/routes/Login.tsx src/components/auth/ProtectedRoute.tsx
git commit -m "feat(frontend): login page + ProtectedRoute guard"
```

---

### Task 16: Admin shell (rail nav + layout)

**Files:**
- Create: `src/components/shell/AdminShell.tsx`

The shell follows the design's rail-nav layout. Phase 1 lights up Customers; other tabs are placeholders that route to a "Coming soon" view.

- [ ] **Step 16.1: Create `src/components/shell/AdminShell.tsx`**

```tsx
// src/components/shell/AdminShell.tsx
import { NavLink, Outlet } from 'react-router-dom';
import { signOut, useSession, useRole } from '@/lib/auth';
import { Button } from '@/components/ui/button';

const NAV = [
  { to: '/inventory', label: 'Inventory', enabled: false },
  { to: '/customers', label: 'Customers', enabled: true },
  { to: '/users', label: 'Users', enabled: false },
  { to: '/settings', label: 'Settings', enabled: false },
  { to: '/audit', label: 'Audit', enabled: false },
];

export function AdminShell() {
  const { session } = useSession();
  const role = useRole();

  return (
    <div className="min-h-screen flex bg-wash">
      <aside className="w-56 bg-surface border-r border-border p-4 flex flex-col">
        <div className="font-semibold text-lg mb-6">Auction OS</div>
        <nav className="space-y-1 flex-1">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              aria-disabled={!item.enabled}
              className={({ isActive }) =>
                `block px-3 py-2 rounded text-sm ${
                  !item.enabled ? 'text-textFaint cursor-not-allowed pointer-events-none' :
                  isActive ? 'bg-info-bg text-accent font-medium' : 'text-textDim hover:bg-surfaceAlt'
                }`
              }
            >
              {item.label}{!item.enabled && ' (later)'}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-border pt-4 mt-4 space-y-2">
          <div className="text-xs text-textDim truncate">{session?.user.email}</div>
          <div className="text-xs text-textFaint">{role}</div>
          <Button variant="ghost" size="sm" className="w-full justify-start" onClick={() => signOut()}>Sign out</Button>
        </div>
      </aside>
      <main className="flex-1 p-6 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
```

- [ ] **Step 16.2: Commit**

```bash
git add src/components/shell
git commit -m "feat(frontend): AdminShell rail-nav layout"
```

---

### Task 17: Customers page (list + create dialog)

**Files:**
- Create: `src/hooks/useCustomers.ts`, `src/routes/Customers.tsx`

- [ ] **Step 17.1: Create `src/hooks/useCustomers.ts`**

```ts
// src/hooks/useCustomers.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { CustomerDTO } from '@shared/types';

export function useCustomers() {
  return useQuery({
    queryKey: ['customers'],
    queryFn: () => api<{ customers: CustomerDTO[] }>('/customers').then((r) => r.customers),
  });
}

export function useCreateCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string }) => api<CustomerDTO>('/customers', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customers'] }),
  });
}
```

- [ ] **Step 17.2: Create `src/routes/Customers.tsx`**

```tsx
// src/routes/Customers.tsx
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useCustomers, useCreateCustomer } from '@/hooks/useCustomers';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';

export function Customers() {
  const { data, isLoading, error } = useCustomers();
  const create = useCreateCustomer();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');

  async function onCreate() {
    await create.mutateAsync({ name });
    setName('');
    setOpen(false);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Customers</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button>New customer</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New customer</DialogTitle></DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={onCreate} disabled={!name.trim() || create.isPending}>
                {create.isPending ? 'Creating…' : 'Create'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {error && <p className="text-sm text-danger">Error loading: {(error as Error).message}</p>}
      {isLoading && <p className="text-sm text-textDim">Loading…</p>}
      {data && (
        <Table>
          <TableHeader>
            <TableRow><TableHead>Name</TableHead><TableHead>Created</TableHead><TableHead /></TableRow>
          </TableHeader>
          <TableBody>
            {data.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">{c.name}</TableCell>
                <TableCell className="text-textDim font-mono text-xs">{new Date(c.createdAt).toLocaleString()}</TableCell>
                <TableCell><Link to={`/customers/${c.id}`} className="text-accent hover:underline text-sm">View jobs →</Link></TableCell>
              </TableRow>
            ))}
            {data.length === 0 && <TableRow><TableCell colSpan={3} className="text-textDim text-center">No customers yet</TableCell></TableRow>}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
```

- [ ] **Step 17.3: Commit**

```bash
git add src/hooks src/routes/Customers.tsx
git commit -m "feat(frontend): Customers list page with create dialog"
```

---

### Task 18: Customer detail page (jobs section)

**Files:**
- Create: `src/hooks/useJobs.ts`, `src/routes/CustomerDetail.tsx`

- [ ] **Step 18.1: Create `src/hooks/useJobs.ts`**

```ts
// src/hooks/useJobs.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type JobDTO = {
  id: string;
  customerId: string;
  jobNumber: string;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export function useJobs(customerId: string | undefined) {
  return useQuery({
    queryKey: ['jobs', customerId],
    enabled: !!customerId,
    queryFn: () => api<{ jobs: JobDTO[] }>(`/jobs?customerId=${customerId}`).then((r) => r.jobs),
  });
}

export function useCreateJob(customerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { jobNumber: string }) => api<JobDTO>('/jobs', { method: 'POST', body: JSON.stringify({ customerId, ...input }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['jobs', customerId] }),
  });
}

export function useToggleJobClosed(customerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, closed }: { id: string; closed: boolean }) =>
      api<JobDTO>(`/jobs/${id}`, { method: 'PATCH', body: JSON.stringify({ closed }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['jobs', customerId] }),
  });
}
```

- [ ] **Step 18.2: Create `src/routes/CustomerDetail.tsx`**

```tsx
// src/routes/CustomerDetail.tsx
import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { CustomerDTO } from '@shared/types';
import { useJobs, useCreateJob, useToggleJobClosed } from '@/hooks/useJobs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';

export function CustomerDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: customer } = useQuery({
    queryKey: ['customer', id],
    enabled: !!id,
    queryFn: () => api<CustomerDTO>(`/customers/${id}`),
  });
  const { data: jobs } = useJobs(id);
  const create = useCreateJob(id!);
  const toggle = useToggleJobClosed(id!);
  const [open, setOpen] = useState(false);
  const [jobNumber, setJobNumber] = useState('');

  async function onCreate() {
    try {
      await create.mutateAsync({ jobNumber });
      setJobNumber('');
      setOpen(false);
    } catch (e: any) {
      alert(e.message);
    }
  }

  if (!customer) return <p className="text-textDim">Loading…</p>;

  return (
    <div className="space-y-6">
      <div>
        <Link to="/customers" className="text-sm text-textDim hover:underline">← Customers</Link>
        <h1 className="text-2xl font-bold mt-2">{customer.name}</h1>
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Jobs</h2>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button>New job</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>New job for {customer.name}</DialogTitle></DialogHeader>
              <div className="space-y-2">
                <Label htmlFor="jobNumber">Job number</Label>
                <Input id="jobNumber" value={jobNumber} onChange={(e) => setJobNumber(e.target.value)} autoFocus placeholder="e.g. 2026-04-Smith-001" />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={onCreate} disabled={!jobNumber.trim() || create.isPending}>
                  {create.isPending ? 'Creating…' : 'Create'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <Table>
          <TableHeader>
            <TableRow><TableHead>Job number</TableHead><TableHead>Status</TableHead><TableHead>Created</TableHead><TableHead /></TableRow>
          </TableHeader>
          <TableBody>
            {jobs?.map((j) => (
              <TableRow key={j.id}>
                <TableCell className="font-mono text-sm">{j.jobNumber}</TableCell>
                <TableCell>
                  {j.closedAt
                    ? <span className="text-xs px-2 py-0.5 rounded-pill bg-warning-bg text-warning">Closed</span>
                    : <span className="text-xs px-2 py-0.5 rounded-pill bg-success-bg text-success">Open</span>}
                </TableCell>
                <TableCell className="text-textDim font-mono text-xs">{new Date(j.createdAt).toLocaleDateString()}</TableCell>
                <TableCell>
                  <Button size="sm" variant="ghost" onClick={() => toggle.mutate({ id: j.id, closed: !j.closedAt })}>
                    {j.closedAt ? 'Reopen' : 'Close'}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {jobs?.length === 0 && <TableRow><TableCell colSpan={4} className="text-textDim text-center">No jobs yet</TableCell></TableRow>}
          </TableBody>
        </Table>
      </section>
    </div>
  );
}
```

- [ ] **Step 18.3: Commit**

```bash
git add src/routes/CustomerDetail.tsx src/hooks/useJobs.ts
git commit -m "feat(frontend): customer detail page with jobs list + create + close/reopen"
```

---

### Task 19: Wire routes into App.tsx

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 19.1: Replace `src/App.tsx`**

```tsx
// src/App.tsx
import { Routes, Route, Navigate } from 'react-router-dom';
import { Login } from './routes/Login';
import { Customers } from './routes/Customers';
import { CustomerDetail } from './routes/CustomerDetail';
import { AdminShell } from './components/shell/AdminShell';
import { ProtectedRoute } from './components/auth/ProtectedRoute';

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<ProtectedRoute><AdminShell /></ProtectedRoute>}>
        <Route path="/customers" element={<Customers />} />
        <Route path="/customers/:id" element={<CustomerDetail />} />
        <Route path="/" element={<Navigate to="/customers" replace />} />
        <Route path="*" element={<Navigate to="/customers" replace />} />
      </Route>
    </Routes>
  );
}
```

- [ ] **Step 19.2: Smoke-test the app**

```bash
npm run dev
# in another terminal:
npx vercel dev
```

Open `http://localhost:5173`, log in with the seeded admin (`admin@auction-os.local` / `admin1234!`), confirm:
1. Lands on `/customers` after login
2. Can create a customer
3. Click into a customer, can create a job
4. Can close / reopen the job
5. Sign out returns to `/login`

- [ ] **Step 19.3: Commit**

```bash
git add src/App.tsx
git commit -m "feat(frontend): wire routes into App with ProtectedRoute and AdminShell"
```

---

### Task 20: Playwright smoke test

**Files:**
- Create: `playwright.config.ts`, `tests/e2e/smoke.spec.ts`

- [ ] **Step 20.1: Create `playwright.config.ts`**

```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  use: { baseURL: 'http://localhost:5173', trace: 'on-first-retry' },
  webServer: [
    { command: 'npm run dev', url: 'http://localhost:5173', reuseExistingServer: !process.env.CI },
    { command: 'npx vercel dev --listen 3000', url: 'http://localhost:3000/api/health', reuseExistingServer: !process.env.CI },
  ],
});
```

- [ ] **Step 20.2: Install Playwright browsers**

```bash
npx playwright install chromium
```

- [ ] **Step 20.3: Write smoke test**

```ts
// tests/e2e/smoke.spec.ts
import { test, expect } from '@playwright/test';

test('admin can log in, create customer, create job, close job', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('admin@auction-os.local');
  await page.getByLabel('Password').fill('admin1234!');
  await page.getByRole('button', { name: /sign in/i }).click();

  await expect(page).toHaveURL(/\/customers/);

  // Create customer with a unique name
  const customerName = `Smoke Test ${Date.now()}`;
  await page.getByRole('button', { name: 'New customer' }).click();
  await page.getByLabel('Name').fill(customerName);
  await page.getByRole('button', { name: 'Create' }).click();

  // Click into it
  await page.getByText(customerName).first().click();
  await expect(page.getByRole('heading', { name: customerName })).toBeVisible();

  // Create a job
  const jobNumber = `J-${Date.now()}`;
  await page.getByRole('button', { name: 'New job' }).click();
  await page.getByLabel('Job number').fill(jobNumber);
  await page.getByRole('button', { name: 'Create' }).click();

  // Close it
  await page.getByRole('row', { name: new RegExp(jobNumber) }).getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('row', { name: new RegExp(jobNumber) }).getByText('Closed')).toBeVisible();
});
```

- [ ] **Step 20.4: Run the smoke test**

```bash
npm run test:e2e
```

Expected: 1 passing test.

- [ ] **Step 20.5: Commit**

```bash
git add playwright.config.ts tests/e2e
git commit -m "test(e2e): playwright smoke test for login → create customer → create job → close"
```

---

### Task 21: Vercel deployment readiness

**Files:**
- Modify: `README.md` (add deployment section)
- Verify: `vercel.ts`, `.env.example`, `package.json` build script

- [ ] **Step 21.1: Verify the build runs cleanly**

```bash
npm run typecheck
npm run build
```

Expected: no errors; `dist/` is generated.

- [ ] **Step 21.2: Document deployment in README**

Append to `README.md`:

```markdown
## Deploying to Vercel

1. Push the repo to GitHub.
2. In Vercel dashboard: New Project → Import the repo.
3. In project settings, set environment variables (use `vercel env add` for each):
   - `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
   - `DATABASE_URL` (Supabase pooled connection string for serverless)
   - `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
4. Set Supabase project's "Allowed redirect URLs" to include the Vercel deployment domain.
5. Apply migrations on the production Supabase: connect with `supabase link` and run `supabase db push`.
6. Run `npm run seed:admin` against the production DB to provision the initial admin (one time).
```

- [ ] **Step 21.3: Commit**

```bash
git add README.md
git commit -m "docs: vercel deployment instructions"
```

---

## Self-Review

**1. Spec coverage:**
- §3 Roles, RBAC, RLS strategy → Tasks 5, 6 (JWT hook + RLS policies). ✓
- §4 Data model (all tables) → Task 3 (full schema in one Drizzle file). ✓
- §11 Audit log structure + triggers → Task 7. ✓
- §12 Tech stack → Tasks 1, 2, 9 (Vite/React/Tailwind/shadcn/Hono/Drizzle/Supabase). ✓
- Customer CRUD → Tasks 11, 17 (API + UI). ✓
- Job CRUD with `closed_at` per D-005 → Tasks 12, 18. ✓
- User management (admin only) → Task 13. ✓
- Initial admin provisioning per Round 3 carry-forward → Task 8. ✓
- Vercel + `vercel.ts` per knowledge update → Tasks 9, 21. ✓

**2. Placeholder scan:** No "TBD"/"TODO"/"implement later"/etc. Every step has either exact code, exact commands, or exact configuration. ✓

**3. Type consistency:** `CustomerDTO`, `JobDTO`, `appUser`, `customer`, `job` table names, and column names referenced consistently across schema, API, and frontend. JWT claim path (`app_metadata.role`) consistent between hook (Task 5), middleware (Task 9), and frontend `useRole` (Task 14). ✓

---

## What ships at end of Phase 1

- A deployable Vite + Hono app on Vercel.
- Supabase Postgres with the full v1 schema, RLS, JWT custom claim hook, and audit-log triggers in place.
- An initial admin user can sign in, create customers, create jobs, close/reopen jobs.
- Test infrastructure (Vitest API tests + Playwright smoke).
- All foundation for Phase 2 (mobile cataloging) is ready: lot/lot_photo tables exist, RLS allows lot inserts/updates, audit triggers will capture cataloging activity.

## Out of scope for Phase 1 (deferred to later phases)

- Mobile cataloging UI (Phase 2).
- Photo capture pipeline (Phase 2).
- Inventory list / browse / lot detail modal (Phase 3).
- Lot lifecycle UI / state-change confirmations (Phase 4).
- AI subsystem (Phase 5).
- Label printing (Phase 2).
- Admin Users / Settings / Audit pages (Phase 6).
