# Working state — Auction Inventory SaaS

> Last updated 2026-04-30. **Phase 1 implementation is complete and JWT hook activated on Dev + Test.** End-to-end auth verified: signing in as the seeded admin produces a JWT with `app_metadata.role = "admin"`. Production rollout (manual prereq #2 below) remains.

## Phase 1 status: ✅ All 22 tasks done

| # | Task | Status |
|---|---|---|
| 1 | Repo init + base tooling | ✅ |
| 0 | Env scripts (verify-env, env-setup) | ✅ |
| 2 | Vite + React + Tailwind + shadcn/ui frontend | ✅ |
| 3 | Drizzle schema for all v1 tables | ✅ |
| 4 | Apply schema to Dev + Test Supabase projects | ✅ |
| 5 | JWT Custom Access Token Hook (function in DB) | ✅ |
| 6 | RLS policies for v1 tables | ✅ |
| 7 | Audit-log triggers | ✅ |
| 8 | Initial admin seed script | ✅ |
| 9 | Hono API scaffold + auth middleware | ✅ |
| 10 | Test infrastructure (Vitest + DB helpers + JWKS injection) | ✅ |
| 11 | Customer CRUD endpoints (TDD) | ✅ |
| 12 | Job CRUD endpoints (TDD) | ✅ |
| 13 | User management endpoints (admin-only TDD) | ✅ |
| 14 | Frontend Supabase client, auth helpers, API wrapper | ✅ |
| 15 | Login page + ProtectedRoute | ✅ |
| 16 | Admin shell (rail nav + layout) | ✅ |
| 17 | Customers page (list + create dialog) | ✅ |
| 18 | Customer detail page (jobs section) | ✅ |
| 19 | Wire routes into App.tsx | ✅ |
| 20 | Playwright smoke test (config + spec — needs hook activation to actually pass) | ✅ |
| 21 | Vercel deployment readiness (README docs) | ✅ |

26 commits total. Vitest API suite: **21 tests passing** (10 customers + 6 jobs + 4 users + 1 infra). Build clean (492 kB JS / 34 kB CSS gzipped).

## Manual prerequisites before deployment / end-to-end use

Two actions only the user can perform. Neither blocks the codebase, but both are required before the live app actually works:

### 1. ~~Activate the JWT custom-claim hook in each Supabase dashboard~~ ✅ Done for Dev + Test (Prod still pending — see #2)

Dashboard label is **JWT Claims Hook** (or "Customize Access Token (JWT) Claims hook"); function name is `custom_access_token_hook`. Both Dev and Test activated and verified — the JWT now carries `app_metadata.role: "admin"` for the seeded admin.

**Critical fix discovered during activation:** the original `0002_jwt_custom_claim_hook.sql` created the function without `SECURITY DEFINER`, so it ran as `supabase_auth_admin` and got blocked by RLS on `app_user` (the role-policy check in `0003_rls_policies.sql` is never true at hook execution time). Fix migration `0005_jwt_hook_security_definer.sql` adds SECURITY DEFINER + pinned search_path. Applied to Dev + Test. **Prod will get this baseline correctly when migrations are first applied** (Task 21 / manual prereq #2).

### 2. (Production-only) Apply migrations + seed admin

When ready to deploy to prod:
- Apply migrations: `npx supabase db push --db-url <prod URL>`
- Run `npm run seed:admin` against prod (with `.env` pointed at Prod) to provision the initial admin user
- Set Vercel env vars to point at Prod credentials (already done for dev/preview/development scopes via `npm run env:setup`; production was deliberately deferred)

## Plan deviations applied (worth amending the plan with)

1. **Task 1 / Step 1.2** — `@vercel/config@^1.0.0` → `^0.2.1` (plan version doesn't exist on npm)
2. **Task 1 / Step 1.2** — `drizzle-orm@^0.36.0` → `^0.45.0` (CVE GHSA-gpj5-g38j-94v9 fixed in 0.45.2)
3. **Task 1 / Step 1.6** — README step 3 `supabase start` → `npm run supabase:start` (CLI is a local devDep)
4. **Task 1 / Step 1.4** — skipped; pre-existing `.gitignore` is a strict superset
5. **Task 0 / Step 0.3** — `env-setup.ts` uses `vercel api /v10/projects/.../env` (REST POST) instead of `vercel env add` due to CLI v52 non-interactive bug
6. **Task 0 / Stage 0b deferred item** — `gh repo create Vantheos/auction-os --private --source=. --remote=origin` executed during Task 0
7. **Task 0 / follow-up fix** — Windows PATH normalization (`%APPDATA%\npm`) + `GITHUB_TOKEN`/`GH_TOKEN` strip for child processes
8. **Task 0 / DATABASE_URL form** — must be Supabase **Shared Pooler** (toggle "Use IPv4 connection" ON); Direct connection is IPv6-only on Pro plan
9. **Task 2 / Step 2.8** — shadcn CLI v4 deprecated `--style new-york --base-color slate` flags; used `--preset nova` (radix-nova). Mica Slate tokens override visual baseline
10. **Task 2 / Step 2.8** — `form` not in nova registry; hand-written `src/components/ui/form.tsx` following canonical shadcn 4 pattern
11. **Task 2 / shadcn 4 deps** — `radix-ui` umbrella package (Feb 2026 standard), `tw-animate-css`, `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`. `shadcn` CLI moved to devDependencies
12. **Task 2 / `tailwind.config.ts`** — `outlineColor.ring` token added for shadcn's `@apply outline-ring/50` reset
13. **Task 3 / Drizzle 0.45 API** — `pgTable` index/check callback uses array form `(t) => [...]` (deprecated object form would error)
14. **Tasks 4–7 / supabase CLI** — PAT revoked at end of Stage 0b, so `supabase link` won't authenticate. Migrations applied via `supabase db push --db-url <url>` instead. Functional outcome identical
15. **Task 5 cloud-hook activation** — only DB-side function installed by migration; cloud-side hook registration in dashboard is a separate manual step (see "Manual prerequisites" #1)
16. **Task 12 / Drizzle wrapped errors** — postgres error code lives in `err.cause?.code` (Drizzle wraps it). Used `err.code ?? err.cause?.code` for the unique-constraint 409 detection
17. **Task 14-19 / `tsconfig.json`** — added `"types": ["vite/client"]` so `import.meta.env` typechecks. Build-blocking fix
18. **Task 20** — Playwright test file + config committed; cleanup added stray `vercel.js`/`vercel.d.ts` artifacts to `.gitignore`
19. **Post-Phase-1 fix — JWT hook RLS bypass** — `0005_jwt_hook_security_definer.sql` adds `SECURITY DEFINER` + `SET search_path = public` to `custom_access_token_hook`. The original migration ran as `supabase_auth_admin`, which has GRANT SELECT but is still blocked by the RLS policy on `app_user`. Result was `app_metadata.role = null`. Fix verified end-to-end: JWT now carries `role = "admin"` correctly.
20. **Post-Phase-1 fix — `tsconfig.json` `vite/client` types** — Task 14-19 subagent edited tsconfig but never committed. Fresh-clone build would have failed. Now committed.
21. **Post-Phase-1 fix — Hono Vercel adapter** — switched from `hono/vercel` (Web-Standards pass-through; only works on Vercel Edge or with Web Request invocation) to `@hono/node-server/vercel` (proper Node IncomingMessage → Web Request adapter). Production Vercel Fluid Compute also accepts the new adapter. Each `api/*.ts` file now exports both a `fetch` named export (for Vitest direct invocation) and the Node-style adapter as default (for Vercel runtime). Test files updated to `import { fetch as handler }`.
22. **Post-Phase-1 fix — Vercel function config** — removed `runtime: 'nodejs'` from per-file `export const config` and from `vercel.ts`. The string `'nodejs'` is parsed as a custom runtime package name expecting `@version`, not as a runtime selector. Node.js is the platform default; omitting the key is correct.
23. **Post-Phase-1 fix — Playwright config** — simplified to a single `webServer` entry running just `vercel dev`. The previous config ran both `npm run dev` and `vercel dev` in parallel, which fought for port 3000 (vercel dev itself spawns vite as the framework dev command).
24. **Known limitation — Playwright e2e under `vercel dev`** — Vercel's local emulator (`@vercel/node` dev-server) parses POST request bodies in a way that doesn't round-trip cleanly through the Web Request body stream — `c.req.json()` returns null for POSTs under vercel dev. The 21 Vitest API tests verify the handlers work correctly when given a real Web Request (which is what Vercel's actual production runtime hands them), and the JWT auth path is verified via direct `fetch` test. **End-to-end Playwright validation will happen against a Vercel preview deployment**, not local vercel dev.

## Key architectural decisions still in force

- **JWT signing: ES256** via Supabase JWKS at `<SUPABASE_URL>/auth/v1/.well-known/jwks.json`. No shared `JWT_SECRET` anywhere. Tests inject a local JWKS via `setJwksForTesting()` escape hatch on the auth middleware.
- **Three Supabase projects** on Pro plan. Test = isolated Vitest target. Dev = local + Vercel preview. Prod = production (no migrations applied yet — deliberate gate).
- **Mica Slate** design tokens in `tailwind.config.ts` are the actual design system; shadcn's `radix-nova` style is just primitives that get re-themed.
- **Cloud-first, no local Supabase, no Docker.** Migrations applied via `supabase db push --db-url`.

## What's next (Phase 2 — out of scope for this branch)

Per `docs/superpowers/plans/2026-04-29-phase-1-foundation.md` "Out of scope for Phase 1":
- Mobile cataloging UI (Phase 2)
- Photo capture pipeline (Phase 2)
- Label printing (Phase 2)
- Inventory list / browse / lot detail modal (Phase 3)
- Lot lifecycle UI / state-change confirmations (Phase 4)
- AI subsystem (Phase 5)
- Admin Users / Settings / Audit pages (Phase 6)

A new Phase 2 plan should be written in `docs/superpowers/plans/` before that work begins.

## Files of record

| File | Purpose |
|---|---|
| `.env.setup` | Real credentials for the three Supabase projects (gitignored) |
| `.env.setup.example` | Template, ES256 model |
| `.env`, `.env.test` | Auto-generated by `npm run env:setup` (gitignored) |
| `.gitignore` | Protects `.env*`, `.vercel/`, `node_modules/`, `*.tsbuildinfo`, compiled config artifacts |
| `.vercel/` | Vercel project link metadata (gitignored) |
| `.claude/settings.json` | Project allowlist (read-only Bash + MCP read tools) |
| `.claude/settings.local.json` | User-private allowlist additions |
| `package.json` | Phase 1 deps; scripts: `env:verify`, `env:setup`, `dev`, `build`, `typecheck`, `test`, `test:e2e`, `seed:admin`, `db:generate`, `db:push` |
| `scripts/verify-env.ts` | Read-only environment health check |
| `scripts/env-setup.ts` | Pushes env vars to Vercel via `vercel api`; writes `.env` + `.env.test` |
| `scripts/seed-admin.ts` | Creates the initial admin user (auth.users + app_user row) |
| `tsconfig.json`, `tsconfig.node.json` | TS config (ESNext + project references; `vite/client` types) |
| `vite.config.ts`, `tailwind.config.ts`, `postcss.config.js` | Frontend build config |
| `components.json` | shadcn/ui config (`radix-nova` style, `@/components/ui` alias) |
| `vitest.config.ts`, `playwright.config.ts` | Test runners |
| `vercel.ts` | Vercel project config (replaces vercel.json) |
| `index.html`, `src/main.tsx`, `src/App.tsx`, `src/styles/globals.css` | Frontend entry |
| `src/lib/{supabase,auth,api,query,utils}.ts` | Frontend libraries |
| `src/components/ui/*.tsx` | shadcn-installed primitives + hand-written `form.tsx` |
| `src/components/auth/ProtectedRoute.tsx`, `src/components/shell/AdminShell.tsx` | App chrome |
| `src/routes/{Login,Customers,CustomerDetail}.tsx` | Pages |
| `src/hooks/{useCustomers,useJobs}.ts` | TanStack Query bindings |
| `api/_app.ts`, `api/_lib/{db,responses}.ts`, `api/_middleware/auth.ts` | Hono API foundation |
| `api/{health,customers,jobs,users}/*.ts` | API endpoints |
| `db/{schema,client,types}.ts`, `drizzle.config.ts` | Drizzle ORM |
| `supabase/config.toml`, `supabase/migrations/*.sql` | Supabase migrations (5 files: schema, seed-system_settings, jwt-hook, RLS, audit-triggers) |
| `tests/helpers/{setup,test-db,test-jwt}.ts` | Test infra |
| `tests/api/{customers,jobs,users}.test.ts` | API tests (21 passing) |
| `tests/e2e/smoke.spec.ts` | Playwright smoke (gated on hook activation) |
| `shared/types.ts` | DTOs shared between frontend and backend |
| `README.md` | Local dev + Vercel deploy docs |
| `docs/superpowers/specs/2026-04-29-v1-design.md` | v1 design spec |
| `docs/superpowers/plans/2026-04-29-phase-1-foundation.md` | Phase 1 plan |
| `STATE.md` | This file |

## Resume prompt (paste verbatim after restart + new conversation)

> Phase 1 of auction-os is complete (per `STATE.md`). Two manual user actions remain: (1) activate the JWT custom-claim hook in each Supabase project's dashboard (Authentication → Hooks → Custom Access Token Hook → `public.custom_access_token_hook`), and (2) apply migrations + seed admin against Prod when ready to deploy. The codebase is ready: 26 commits on master, 21 Vitest tests passing, `npm run build` clean. Next major work is Phase 2 (mobile cataloging) — needs a new plan written before execution. Do not start Phase 2 without an approved plan.

## Key user preferences (in memory)

- Top-down spec process; one focused round per area
- File-based feedback for substantive input
- Mention CWD only when it matters
- Validate environment before running commands
- Don't just agree — push back when better alternatives exist
- Minimize manual human effort; automate where possible
- Auto mode authorized; continue through Phase 1 autonomously unless foundation issues arise
