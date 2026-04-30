# Working state — Auction Inventory SaaS

> Last updated 2026-04-30 ~07:00 ET. **Phase 1 implementation complete and deployed to Vercel preview + production.** User will manually click through the preview URL on return; that's the Phase 1 sign-off. Then Phase 2 planning starts.

## Phase 1 status: ✅ implementation done, ⏳ awaiting manual preview test

| Item | Status |
|---|---|
| Code (22 plan tasks 0–21) | ✅ done |
| Vitest API suite | ✅ 21 tests passing |
| Migrations applied to Dev + Test Supabase | ✅ done (5 migrations) |
| JWT custom-claim hook | ✅ activated on Dev + Test (function migration `0005_jwt_hook_security_definer.sql`) |
| Vercel preview deploy | ✅ Ready |
| Vercel production deploy | ✅ Ready (but inert — Prod Supabase has no schema yet) |
| Manual click-through on preview | ⏳ pending user |
| Phase 2 plan | ❌ not yet written |

## Deploy URLs

- **Preview (the one to test):** `https://auction-fyhk83pn1-vantheos-4047s-projects.vercel.app`
  - Backed by **Dev Supabase** (`auction-os-dev`)
  - Has the seeded admin (`admin@auction-os.local` / `admin1234!`)
  - Has all 5 migrations applied + JWT hook activated
  - Newer preview URLs may exist if more pushes happened — check `vercel ls auction-os` for the latest
- **Production:** `https://auction-n2sns0tyd-vantheos-4047s-projects.vercel.app`
  - Backed by **Prod Supabase** (`auction-os-prod`) — **no schema, no users, no hook activated**
  - Will load the login page but auth/API will fail at runtime
  - Intentionally so; production scope stays empty until v1 cutover

## Manual test steps for the preview URL (Phase 1 sign-off)

1. Open the preview URL → should redirect to `/login`
2. Sign in: `admin@auction-os.local` / `admin1234!` → lands on `/customers`
3. Click "New customer", create one with any name → appears in the table
4. Click into the customer → CustomerDetail page with their name + empty Jobs section
5. Click "New job", create a job → appears as "Open"; click "Close" → flips to "Closed"; click "Reopen" → "Open"
6. Click "Sign out" in the sidebar → returns to login

If all 6 work, Phase 1 is genuinely complete.

## Branch state

| | Local | GitHub |
|---|---|---|
| `main` | `7bbeee0` (36 commits) | `7bbeee0` (force-pushed after history rewrite) |
| `phase-1-foundation` | `a6dc7e4` (35 commits) | `a6dc7e4` |

Both branches' commits are now authored by `Vantheos <ops@vantheos.com>` (was the broken `AndreMan <amattera@outlook.com>` originally — caused Vercel team-membership rejections; rewritten via `git filter-branch`).

**Repo-local git config in force** (so future commits on this repo use the correct identity):
- `user.name = Vantheos`
- `user.email = ops@vantheos.com`

## Vercel project state

- Project: `vantheos-4047s-projects/auction-os` (recreated via dashboard after CLI-creation issues)
- GitHub integration: connected to `Vantheos/auction-os`
- Production branch: `main`
- Preview: any unassigned branch (currently `phase-1-foundation`)
- Env vars: 18 across production/preview/development scopes (pushed via `npm run env:setup`)

## What still must happen before Prod is real (deferred to v1 cutover)

1. Apply 5 migrations to Prod Supabase: `npx supabase db push --db-url "$PROD_DATABASE_URL"`
2. Activate JWT Claims Hook in Prod's Supabase dashboard: Authentication → Hooks → Customize Access Token (JWT) Claims hook → enable, Postgres function `custom_access_token_hook`
3. Run `npm run seed:admin` against Prod (with `.env` pointed at Prod) to provision the initial admin
4. **Change the seeded admin's default password** (`admin1234!`) before any non-test use — set `SEED_ADMIN_PASSWORD` env var before running, or rotate after via Supabase dashboard

## Plan deviations applied during Phase 1 (worth amending the plan with someday)

1. **Task 1** — `@vercel/config@^1.0.0` → `^0.2.1`; `drizzle-orm@^0.36.0` → `^0.45.0` (CVE fix); README step 3 `supabase start` → `npm run supabase:start`; `.gitignore` skip
2. **Task 0** — `env-setup.ts` uses `vercel api /v10/projects/.../env` REST POST instead of `vercel env add` (CLI v52 non-interactive bug); Stage 0b deferred GitHub repo creation done during Task 0; Windows PATH normalization + GITHUB_TOKEN/GH_TOKEN strip; Supabase **Shared Pooler** required for DATABASE_URLs (Direct connection is IPv6-only)
3. **Task 2** — shadcn CLI v4 deprecated `--style new-york --base-color slate`; used `--preset nova` (`radix-nova` style, `neutral` baseColor); `form` not in nova registry → hand-written `src/components/ui/form.tsx`; shadcn 4 deps include `radix-ui` umbrella, `tw-animate-css`; `outlineColor.ring` token added to tailwind config
4. **Task 3** — Drizzle 0.45 deprecated object form for `pgTable` callback; used array form `(t) => [...]`
5. **Tasks 4–7** — Supabase PAT revoked at end of Stage 0b → migrations applied via `supabase db push --db-url <url>` (bypassing `supabase link`)
6. **Task 5** (post-Phase-1 critical fix) — `0005_jwt_hook_security_definer.sql` adds `SECURITY DEFINER` + pinned `search_path = public` to `custom_access_token_hook`. Without this, the hook ran as `supabase_auth_admin` and got blocked by RLS on `app_user`. Result before fix: `app_metadata.role` was always null. Verified end-to-end after fix: JWT carries `role = "admin"` correctly.
7. **Task 12** — postgres error code lives in `err.cause?.code` (Drizzle wraps it); used `err.code ?? err.cause?.code` for unique-constraint 409 detection
8. **Task 14-19** — `tsconfig.json` needed `"types": ["vite/client"]` for `import.meta.env` typecheck
9. **Post-Phase-1 fixes** — switched from `hono/vercel` to `@hono/node-server/vercel` adapter (Node IncomingMessage → Web Request conversion); removed `runtime: 'nodejs'` strings (Vercel parses as custom runtime package); each `api/*.ts` exports both a `fetch` named export (for Vitest) and the Node-style adapter as default (for Vercel runtime); Playwright config simplified to single webServer entry
10. **Local Playwright e2e is blocked** by `vercel dev` body-parsing quirk (POST body doesn't roundtrip cleanly through @vercel/node dev-server). Production runtime works fine. Vercel preview deploy is the canonical e2e verification.
11. **Vercel CLI → Git webhook discovery** — `vercel deploy` from CLI defaults to `--target=production` regardless of branch and ignores `--target=preview`. Use Git push only.
12. **Vercel project creation method matters** — CLI-created projects can have a stale account-context binding. The user's auction-os project was deleted and recreated via the dashboard during this session; that fixed the platform binding.
13. **Commit author email matters** — global git config used `AndreMan <amattera@outlook.com>` which mapped to legacy GitHub account `AAndreManN` (not a Vercel team member). All 38 commits were rewritten via `git filter-branch` to author `Vantheos <ops@vantheos.com>` and force-pushed. Repo-local git config now overrides global.

## Working tree note

`.gitignore` shows as modified in `git status` — `vercel link` appended a duplicate `.vercel` line to the file. It's harmless; a previous controller note flagged that the user is aware of this and didn't want it reverted.

## Known recovery procedures

### Blank screen on Vercel preview (or any) deploy

**Symptom:** Preview URL loads but shows a completely blank page. View source shows the SPA shell HTML but React never mounts.

**Cause:** Vercel project is missing `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` env vars. `src/lib/supabase.ts` throws at module-load when those are undefined, which prevents React from mounting → blank screen. This happens whenever the Vercel project gets recreated or env vars get cleared and `npm run env:setup` isn't re-run afterward (happened once on 2026-04-30 — env vars dropped during project recreation troubleshooting and weren't re-pushed until later).

**Fix:**
1. `vercel env ls` — confirm the 18 expected vars are present across `production`, `preview`, `development` scopes. If missing or empty, that's the cause.
2. `npm run env:setup` — re-pushes all 18 vars from `.env.setup` to the Vercel project.
3. Trigger a rebuild: `git commit --allow-empty -m "ci: rebuild after env vars pushed"` then `git push origin <branch>`.
4. The new preview URL (visible in `vercel ls auction-os`) becomes the working one. Old preview URLs from before the env-var fix stay broken — those are not recoverable without a new build.

If `vercel env ls` itself errors with "Your Project was either deleted, transferred to a new Team, or you don't have access to it anymore," the local link in `.vercel/project.json` is stale. Re-link with `vercel link --yes --project auction-os`, then re-check.

## Resume prompt (paste verbatim after context refresh)

> Welcome back. Read `STATE.md` first. Phase 1 of auction-os is implementation-complete and both Vercel deploys are Ready. The user planned to do the manual click-through test on the preview URL when they return — ask them how that went. If the 6 manual test steps in STATE.md all pass, Phase 1 is signed off and the next thing to do is **write the Phase 2 plan** (in `docs/superpowers/plans/`). Phase 2 is "Mobile cataloging + label printing" per the v1 design spec at `docs/superpowers/specs/2026-04-29-v1-design.md`. Don't start any Phase 2 implementation without an approved plan. The repo-local git config is set to `Vantheos <ops@vantheos.com>`; do NOT change it. Pushes only via `git push origin <branch>` (never `vercel deploy`). Memory in `~/.claude/projects/d--Dev-auction-os/memory/` has the lessons learned — read MEMORY.md early.

## Files of record

| File | Purpose |
|---|---|
| `.env.setup` | Real credentials for the three Supabase projects (gitignored) |
| `.env`, `.env.test` | Auto-generated by `npm run env:setup`; pointed at Dev / Test (gitignored) |
| `.gitignore` | Protects `.env*`, `.vercel/`, `node_modules/`, `*.tsbuildinfo`, compiled config artifacts |
| `.claude/settings.json` | Project allowlist (read-only Bash + MCP read tools) — TRACKED |
| `.claude/settings.local.json` | User-private allowlist — gitignored |
| `package.json` | Phase 1 deps; scripts including `env:verify`, `env:setup`, `dev`, `build`, `typecheck`, `test`, `test:e2e`, `seed:admin`, `db:generate`, `db:push` |
| `scripts/verify-env.ts` | Read-only environment health check |
| `scripts/env-setup.ts` | Pushes env vars to Vercel via `vercel api`; writes `.env` + `.env.test` |
| `scripts/seed-admin.ts` | Creates initial admin (auth.users + app_user row) |
| `vercel.ts`, `vite.config.ts`, `tailwind.config.ts`, `postcss.config.js`, `vitest.config.ts`, `playwright.config.ts` | Build/test config |
| `index.html`, `src/main.tsx`, `src/App.tsx`, `src/styles/globals.css` | Frontend entry |
| `src/lib/{supabase,auth,api,query,utils}.ts` | Frontend libraries |
| `src/components/ui/*.tsx` | shadcn primitives + hand-written `form.tsx` |
| `src/components/auth/ProtectedRoute.tsx`, `src/components/shell/AdminShell.tsx` | App chrome |
| `src/routes/{Login,Customers,CustomerDetail}.tsx` | Pages |
| `src/hooks/{useCustomers,useJobs}.ts` | TanStack Query bindings |
| `api/_app.ts`, `api/_lib/{db,responses}.ts`, `api/_middleware/auth.ts` | Hono API foundation |
| `api/{health,customers,jobs,users}/*.ts` | API endpoints (default export = `@hono/node-server/vercel` Node adapter; named export `fetch` for Vitest) |
| `db/{schema,client,types}.ts`, `drizzle.config.ts` | Drizzle ORM |
| `supabase/config.toml`, `supabase/migrations/0000-0005*.sql` | 5 migrations: schema, seed_system_settings, jwt_hook, rls_policies, audit_triggers, jwt_hook_security_definer |
| `tests/helpers/{setup,test-db,test-jwt}.ts` | Test infra (ES256 keypair injection) |
| `tests/api/{customers,jobs,users}.test.ts` | API tests (21 passing) |
| `tests/e2e/smoke.spec.ts` | Playwright smoke spec — gated on resolution of vercel-dev body parsing quirk |
| `shared/types.ts` | DTOs |
| `README.md` | Local dev + Vercel deploy docs |
| `docs/superpowers/specs/2026-04-29-v1-design.md` | v1 design spec |
| `docs/superpowers/plans/2026-04-29-phase-1-foundation.md` | Phase 1 plan (now historical reference) |
| `STATE.md` | This file |

## Key user preferences (in memory under `~/.claude/projects/d--Dev-auction-os/memory/`)

- Top-down spec process; one focused round per area
- File-based feedback for substantive input
- Mention CWD only when it matters
- Validate environment before running commands
- Never push `master`/`main` until v1 complete; phase work goes on `phase-N-<slug>` branches
- Never run `vercel deploy` (CLI bypasses branch routing); push via Git only
- Verify before directing — never guess at UI/CLI/file locations; check first
- Repo-local git author email matters for Vercel attribution; use `Vantheos <ops@vantheos.com>` for auction-os
