# Working state — Auction Inventory SaaS

> Last updated 2026-04-30 PM ET. **Phase 2 (Lot lifecycle + label printing) implementation complete; pending user manual test sign-off.** All 39 plan tasks implemented across 8 phases, 47 commits ahead of `phase-1-foundation`. 101/101 vitest suite green; typecheck clean; build clean with vendor chunk splitting. Manual click-through gauntlet (31 steps) is the final gate — see "Phase 2 manual test checklist" at the bottom of this file.

## Phase 2 status: 🟡 implementation done, manual sign-off pending

| Item | Status |
|---|---|
| Code (39 plan tasks, A–H) | ✅ done |
| Vitest suite | ✅ 101 tests passing (was 35 after Phase 1; +66 in Phase 2) |
| Migration `0006_system_settings_label_printer.sql` applied to Dev + Test | ✅ done |
| Vercel Pro upgrade (Hobby's 12-function cap exceeded at 15) | ✅ user upgraded mid-flight |
| Vendor chunk splitting (Inventory/Settings/LotDetail lazy) | ✅ main chunk dropped from ~514 KB to ~174 KB |
| Vercel preview deploy | ✅ Ready (`auction-mesjg97wr-vantheos-4047s-projects.vercel.app` at sign-off; latest via `vercel ls auction-os`) |
| `npm run probe:preview` | ✅ all 4 probes green (health 200; system-settings/lots/labels 401 unauth) |
| Test data seeded to Dev | ✅ `npm run seed:test-lots` populated 6 lots in `Test Estate / 2026-04-Test-001` |
| **Manual click-through (31 steps)** | ❌ pending — checklist at bottom of this file |
| **Physical-printer round-trip test** | 🟡 deferred (intentional verification gap; fires when Zebra ZD450 is on hand) |
| **Phase 3 design + plan** | ❌ not started — kicks off after Phase 2 sign-off |

**Phase 2 commits ahead of `phase-1-foundation`** (`git log phase-1-foundation..HEAD --oneline`): 47 commits across the 8 phases plus 4 fix-up commits captured during code review (NaN guards, savepoint pattern, joined-DTO retrofit, pg-error helper extraction).

## Phase 1 status: ✅ signed off

| Item | Status |
|---|---|
| Code (22 plan tasks 0–21) | ✅ done |
| Vitest API suite | ✅ 21 tests passing (refactored to native handler shape) |
| Migrations applied to Dev + Test Supabase | ✅ done (5 migrations) |
| JWT custom-claim hook | ✅ activated on Dev + Test |
| Vercel preview deploy | ✅ Ready |
| Vercel production deploy | ✅ Ready (still inert — Prod Supabase has no schema yet) |
| **Manual click-through on preview** | ✅ all 6 steps passed |
| **Audit-log actor capture** | ✅ wired via `asActor(userId, fn)` GUC pattern |
| **Design system bridged** | ✅ shadcn vars wired to Mica Slate tokens; button variants reviewed and approved |
| **Phase 2 design spec** | ✅ written: `docs/superpowers/specs/2026-04-30-phase-2-design.md` |
| **Phase 2 implementation plan** | ✅ written: `docs/superpowers/plans/2026-04-30-phase-2.md` (39 tasks, 8 phases) |
| **Phase 2 execution** | ❌ not yet started |

## Deploy URLs

- **Preview:** `https://auction-od5nvclsh-vantheos-4047s-projects.vercel.app` (latest at sign-off; newer URLs may exist if more pushes happened — `vercel ls auction-os` for current)
  - Backed by **Dev Supabase** (`auction-os-dev`)
  - Has the seeded admin (`admin@auction-os.local` / `admin1234!`)
  - All 5 migrations applied + JWT hook activated
- **Production:** latest `main` deploy — backed by **Prod Supabase** (`auction-os-prod`), no schema, no users, no hook activated. Intentionally inert until v1 cutover.

## Design system (post-Phase-1, pre-Phase-2)

The Mica Slate tokens from the design pass lived in `tailwind.config.ts` but were never wired to the shadcn primitives — shadcn reads from CSS variables (`--primary`, `--secondary`, etc.) which were stuck on shadcn's stock greyscale defaults. Result: every Phase 1 button rendered as charcoal-on-wash with no brand presence.

Fix (commits `cc08184`, `a07921a`, `96e117a`, `1d149e2`):
- `globals.css` — bridged `--primary`, `--secondary`, `--muted`, `--accent`, `--destructive`, `--border`, `--input`, `--ring`, `--card`, `--popover` to Mica Slate values
- `tailwind.config.ts` — added matching `colors.primary` / `colors.secondary` / etc. as `var(--*)` so utility classes like `bg-primary` actually resolve. Renamed Mica `accent` (`#1E40AF`) → `brand` to free up `accent` for shadcn's hover-bg meaning. Updated 2 callsites (`text-accent` → `text-brand`).
- `button.tsx` — refined per inline review: `outline` uses `borderStrong` (visible 14% border), `secondary` uses `info-bg` pale-blue tint with brand text (visually distinct from outline), `destructive` is now solid red bg + white text (was 10% subtle bg — wrong weight for "Delete customer" confirmations), `ghost` left as intentional no-chrome / hover-bg-only.
- `/design-system` route — auth-gated reference page (no nav link, URL-only access) at `src/routes/DesignSystem.tsx` rendering all variants, sizes, inputs, dialog, table, status badges, typography, plus "buttons in real usage context" examples. Use it as the canonical visual reference when adding new screens.
- `vercel.ts` — added SPA fallback rewrite (`/((?!api/).*) → /index.html`) so direct URL navigation to client-side routes (`/customers`, `/design-system`, etc.) works on hard refresh. Without this, direct nav 404'd.

This is design system bridging only — no new design decisions, just propagating what the design pass already specified. Next time you see something visually weak, this is the layer to touch.

## What we fixed today (post-handoff)

Two latent Phase 1 bugs that didn't surface until the live preview was actually exercised through a real Supabase session — internal checks (typecheck, vitest) and the static `/api/health` probe couldn't catch either:

1. **Extensionless ESM relative imports** (commit [7b651db]) — `tsc` left `import { x } from '../foo'` verbatim, but Node's strict ESM loader (`"type": "module"`) requires `.js` extensions. Lambda crashed with `ERR_MODULE_NOT_FOUND` on every request. Vitest/Vite hide this because their bundlers synthesize extensions. Fix: appended `.js` to all relative imports in `api/` and `db/`. Added `npm run probe:preview <url>` (uses `vercel curl`) to probe `/api/health` on a deployed preview before declaring it good.
2. **`tsc -b --noEmit` propagated noEmit to a composite-referenced project (TS6310)** (commit [2e4cc34]) — pre-existing bug; dropped the `--noEmit` flag from the `typecheck` script (root tsconfig already has `noEmit: true` at config level).
3. **Hono on Vercel hung every POST/PATCH/DELETE for 60s → FUNCTION_INVOCATION_TIMEOUT (504)** (commit [4d8fb14], the big one) — Vercel's Node Lambda runtime delivers POST bodies via the raw `IncomingMessage` stream; it does NOT pre-parse onto `req.body` and does NOT set `req.rawBody`. Both `@hono/node-server/vercel` and Vercel's built-in `createWebHandler` ultimately call `Readable.toWeb(req)`, which never resolves the body read in this runtime. A naked `for await (const chunk of req)` reads the body in 1ms (proven via `api/echo` diagnostic). **Fix: dropped Hono entirely**, rewrote all 7 routes as native `(req: IncomingMessage, res: ServerResponse) => Promise<void>` handlers using Vercel's documented contract. New helpers in `api/_lib/`: `auth.ts` (`requireAuth`, `AuthError`), `body.ts` (`readJson` with 1MiB cap), `responses.ts` (`jsonOk`/`jsonError`/`methodNotAllowed`), `db.ts` extended with `asActor()`. Also closes the audit-trail gap: mutations transactionally `set_config('request.jwt.claim.sub', ...)` so the existing `audit_log_trigger` (which reads `auth.uid()`) records the real actor instead of NULL. Tests refactored to use a `callHandler(handler, opts)` mock-req/res helper. Hono and `@hono/node-server` removed from deps. See `~/.claude/projects/d--Dev-auction-os/memory/feedback_avoid_hono_on_vercel.md` for the lesson and rationale.

## Branch state

| | Local | GitHub |
|---|---|---|
| `main` | `7bbeee0` (36 commits) | same |
| `phase-1-foundation` | `70cc776` (43 commits) | same |

`main` is unchanged from the original Phase 1 deploy point. Phase 1 sign-off was on `phase-1-foundation` (preview); merging to `main` is deliberately deferred to v1 cutover per the branch strategy.

**Repo-local git config in force** (do NOT change):
- `user.name = Vantheos`
- `user.email = ops@vantheos.com`

## Vercel project state

- Project: `vantheos-4047s-projects/auction-os`
- GitHub integration: connected to `Vantheos/auction-os`
- Production branch: `main`
- Preview: any unassigned branch (currently `phase-1-foundation`)
- Env vars: 18 across production/preview/development scopes (pushed via `npm run env:setup`; if dropped during dashboard work, see "Blank screen on preview" recovery below)

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
9. **Post-handoff (today)** — see "What we fixed today" above. The Hono refactor is the largest deviation from the original plan and should be reflected in any retrospective: the Phase 1 plan called out `hono` in the tech stack, but it does not work on Vercel's Node Lambda runtime for body-bearing requests. Native handlers are the production pattern for this repo.
10. **Local Playwright e2e is blocked** by `vercel dev` body-parsing quirk (POST body doesn't roundtrip cleanly through @vercel/node dev-server). Production runtime works fine. Vercel preview deploy is the canonical e2e verification.
11. **Vercel CLI → Git webhook discovery** — `vercel deploy` from CLI defaults to `--target=production` regardless of branch and ignores `--target=preview`. Use Git push only.
12. **Vercel project creation method matters** — CLI-created projects can have a stale account-context binding. The user's auction-os project was deleted and recreated via the dashboard during Phase 1; that fixed the platform binding.
13. **Commit author email matters** — global git config used `AndreMan <amattera@outlook.com>` which mapped to legacy GitHub account `AAndreManN` (not a Vercel team member). All commits were rewritten via `git filter-branch` to author `Vantheos <ops@vantheos.com>` and force-pushed. Repo-local git config now overrides global.

## Working tree note

`.gitignore` previously showed as modified — `vercel link` appended a duplicate `.vercel` line. Status today is clean (no notable working-tree drift).

## Known recovery procedures

### Blank screen on Vercel preview (or any) deploy

**Symptom:** Preview URL loads but shows a completely blank page. View source shows the SPA shell HTML but React never mounts.

**Cause:** Vercel project is missing `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` env vars. `src/lib/supabase.ts` throws at module-load when those are undefined, which prevents React from mounting → blank screen. This happens whenever the Vercel project gets recreated or env vars get cleared and `npm run env:setup` isn't re-run afterward.

**Fix:**
1. `vercel env ls` — confirm the 18 expected vars are present across `production`, `preview`, `development` scopes. If missing or empty, that's the cause.
2. `npm run env:setup` — re-pushes all 18 vars from `.env.setup` to the Vercel project.
3. Trigger a rebuild: `git commit --allow-empty -m "ci: rebuild after env vars pushed"` then `git push origin <branch>`.
4. The new preview URL (visible in `vercel ls auction-os`) becomes the working one. Old preview URLs from before the env-var fix stay broken — those are not recoverable without a new build.

If `vercel env ls` itself errors with "Your Project was either deleted, transferred to a new Team, or you don't have access to it anymore," the local link in `.vercel/project.json` is stale. Re-link with `vercel link --yes --project auction-os`, then re-check.

### Probing a fresh deploy before declaring it good

`npm run probe:preview <url>` — uses `vercel curl` (handles deployment protection) to GET `/api/health` on a deployed preview and asserts `{ ok: true }`. Run this after every push as the gating check before any manual-test work; it catches build/import/runtime failures that pass typecheck and vitest. Was added today after the `.js`-extension regression (commit [7b651db]).

## Resume prompt (paste verbatim after context refresh)

> Welcome back. Read `STATE.md` first. Phase 1 of auction-os is **fully signed off** (2026-04-30 PM). Phase 2 has been **scoped, designed, and planned**:
>
> - **Phase 2 design spec:** `docs/superpowers/specs/2026-04-30-phase-2-design.md` — "Lot lifecycle + label printing" (desktop tool: inventory list, lot detail modal, single-lot + bulk actions, label printing module, system settings). Note that Phase 2 was flipped from the original "mobile cataloging" — mobile cataloging is now Phase 3 per the design handoff's recommended sequencing and the user's no-throwaway constraint.
> - **Phase 2 implementation plan:** `docs/superpowers/plans/2026-04-30-phase-2.md` — 39 tasks across 8 phases (A foundations, B backend, C hooks, D lot detail UI, E inventory UI, F bulk dialogs, G pages+routing, H verification) with explicit checkpoints between phases.
>
> The next thing to do is **execute the Phase 2 plan**. Use the `superpowers:subagent-driven-development` skill (recommended for token-budget reasons — this main session has been long) or `superpowers:executing-plans` if you prefer inline. **Do NOT modify the spec or plan without flagging it explicitly to the user — they're committed and locked.**
>
> Companion docs to read alongside the plan:
> - `docs/superpowers/specs/2026-04-29-v1-design.md` — overall v1 design (authoritative for product decisions)
> - `ui-design/design_handoff/` — high-fidelity UI mockups + tokens (the design pass before Phase 1)
> - `~/.claude/projects/d--Dev-auction-os/memory/MEMORY.md` — lessons learned. `feedback_avoid_hono_on_vercel.md` is critical context if a Hono-like framework is ever proposed again.
>
> The repo-local git config is set to `Vantheos <ops@vantheos.com>`; do NOT change it. Pushes only via `git push origin <branch>` (never `vercel deploy`). Phase 2 work continues on `phase-1-foundation` branch (or a new `phase-2-lot-lifecycle` branch — your call; conventional choice would be a new branch).

## Files of record

| File | Purpose |
|---|---|
| `.env.setup` | Real credentials for the three Supabase projects (gitignored) |
| `.env`, `.env.test` | Auto-generated by `npm run env:setup`; pointed at Dev / Test (gitignored) |
| `.gitignore` | Protects `.env*`, `.vercel/`, `node_modules/`, `*.tsbuildinfo`, compiled config artifacts |
| `.claude/settings.json` | Project allowlist (read-only Bash + MCP read tools) — TRACKED |
| `.claude/settings.local.json` | User-private allowlist — gitignored |
| `package.json` | Phase 1 deps (Hono removed); scripts: `env:verify`, `env:setup`, `dev`, `build`, `typecheck`, `test`, `test:e2e`, `seed:admin`, `db:generate`, `db:push`, `probe:preview` |
| `scripts/verify-env.ts` | Read-only environment health check |
| `scripts/env-setup.ts` | Pushes env vars to Vercel via `vercel api`; writes `.env` + `.env.test` |
| `scripts/seed-admin.ts` | Creates initial admin (auth.users + app_user row) |
| `scripts/probe-deploy.ts` | Smoke-test `/api/health` against a deployed preview via `vercel curl` |
| `vercel.ts`, `vite.config.ts`, `tailwind.config.ts`, `postcss.config.js`, `vitest.config.ts`, `playwright.config.ts` | Build/test config |
| `index.html`, `src/main.tsx`, `src/App.tsx`, `src/styles/globals.css` | Frontend entry |
| `src/lib/{supabase,auth,api,query,utils}.ts` | Frontend libraries |
| `src/components/ui/*.tsx` | shadcn primitives + hand-written `form.tsx` |
| `src/components/auth/ProtectedRoute.tsx`, `src/components/shell/AdminShell.tsx` | App chrome |
| `src/routes/{Login,Customers,CustomerDetail}.tsx` | Pages |
| `src/hooks/{useCustomers,useJobs}.ts` | TanStack Query bindings |
| `api/_lib/{auth,body,db,responses}.ts` | API foundation: JWT verify + role check, body reading, Drizzle client + `asActor` actor-scoped transactions, JSON response helpers (all native `(req, res)`) |
| `api/{health,customers,jobs,users}/*.ts` | API endpoints (all native `(req: IncomingMessage, res: ServerResponse) => Promise<void>`; method dispatch via `if (req.method === ...)`; central try/catch translates `AuthError` → 401/403) |
| `db/{schema,client,types}.ts`, `drizzle.config.ts` | Drizzle ORM |
| `supabase/config.toml`, `supabase/migrations/0000-0005*.sql` | 5 migrations: schema, seed_system_settings, jwt_hook, rls_policies, audit_triggers, jwt_hook_security_definer |
| `tests/helpers/{setup,test-db,test-jwt,call-handler}.ts` | Test infra (ES256 keypair injection + mock-req/res driver) |
| `tests/api/{customers,jobs,users}.test.ts` | API tests (21 passing; refactored to native handler shape) |
| `tests/e2e/smoke.spec.ts` | Playwright smoke spec — gated on resolution of vercel-dev body parsing quirk |
| `shared/types.ts` | DTOs |
| `README.md` | Local dev + Vercel deploy docs |
| `docs/superpowers/specs/2026-04-29-v1-design.md` | v1 design spec (authoritative for Phase 2+) |
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
- **Avoid Hono on Vercel — use native (req, res) handlers** (added today after Phase 1 debug)
- Production-worthy from day one — no proof-of-concept / MVP / band-aid solutions; if a workaround is the only path, name it as such and propose the proper fix

---

## Phase 2 manual test checklist (sign-off)

Run against the latest preview URL after `npm run seed:test-lots` has been applied to Dev.

### Inventory
1. Open preview URL → redirects to `/inventory`
2. Inventory loads showing the 6 seeded lots (5 in `Test Estate / 2026-04-Test-001` + 1 unassigned `Mystery Item`)
3. Filter by Customer "Test Estate" → list narrows to 5
4. Filter by Job → list still shows 5
5. Toggle State filter chips → list updates per selection
6. Clear filters → all 6 lots return

### Single-lot modal
7. Click row → lot detail modal opens with the lot's data
8. URL contains `?openLot=<id>`; refresh keeps modal open
9. Edit title, click Save → toast "Lot updated"; row title updates after close
10. Click Reprint label → toast "Printer not configured" (helper URL not set yet — expected)
11. Click Change status → menu shows only legal transitions for current state
12. Pick `sold` (from `assigned`) → state pill flips immediately (optimistic), no confirm
13. Pick `picked-up` (from `sold`) → confirm modal appears; click Confirm → flips
14. Open the picked-up lot → modal shows 🔒 Read-only; no form, only Reprint + Change-status buttons
15. From a `not-sellable` lot, Change-status → `unassigned` → flips back; `(jobId, lotNumber)` cleared

### Move
16. On an `assigned` lot, click Move to another auction → dialog opens
17. Pick destination customer + job; submit → toast "Lot updated"; lot now belongs to new job
18. Move dialog should NOT show on a `sold` lot (button hidden — assigned-only per spec §4.2)

### Bulk
19. Select 2 assigned lots via row checkbox → bulk action bar appears at bottom
20. Bulk Change status → only shared transitions shown; pick `sold` → both flip; toast "2 lots updated"
21. Select 2 lots in different states (one assigned, one picked-up) → Bulk Change status dialog says "no shared legal transitions"
22. Bulk Move → dialog → confirm → both move
23. Bulk Delete (admin only) → type `DELETE` to enable submit → both deleted; toast confirms count
24. Bulk Export CSV → CSV downloads; verify columns match v1 manifest (id, customer, job, lot_number, state, title, description, price, special_notes_category, special_notes_text, untested, quantity, ai_status, created_at, updated_at)

### Settings
25. As admin, navigate to `/settings`
26. Set Helper URL to `http://localhost:9100`; click Test → reports "✗ Helper unreachable" (expected, no helper running)
27. Click Save → toast "Settings saved"; refresh confirms persistence

### Mobile lot view
28. Visit `/lot/<a-lot-id>` directly in browser
29. Resize browser to 375px wide (or open on a phone) — fields stack vertically, photo grid wraps, all actions reachable without horizontal scroll

### Audit trail spot-check
30. Run: `psql "$DEV_DATABASE_URL" -c "SELECT changed_at, action, changed_by FROM audit_log WHERE table_name = 'lot' ORDER BY changed_at DESC LIMIT 10;"`
31. Confirm `changed_by` is non-NULL and matches the admin user's id for every recent mutation

### Acceptance
- [ ] All 31 steps above pass
- [ ] No console errors visible during the flow
- [ ] No `FUNCTION_INVOCATION_TIMEOUT` or 500s in `vercel logs`

If all pass → Phase 2 is signed off. Move to Phase 3 plan (mobile cataloging + photo capture pipeline).

**Deferred to physical-printer test (NOT a Phase 2 blocker):**
- [ ] With Zebra Browser Print helper installed and Zebra ZD450 connected: Test button reports "✓ Helper reachable" and Reprint Label produces a physical 2"×1" label that scans correctly via QR
