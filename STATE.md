# Working state — Auction Inventory SaaS

> Last updated 2026-05-03 late evening. **Phase 4 (Settings + Users + Customers/Jobs polish) signed off.** All 5 areas shipped, manual sign-off batch caught + fixed a toast-persistence bug, a disabled-user login hang, and a useSession race condition I introduced in the disabled-detection logic. 214/214 vitest suite green; lint 0/0; build clean. Branch `phase-4-settings-users` at `fc2bb25`, 7 commits ahead of `phase-3-5-test-infra`. **Next:** Phase 5 — Auction Platform Export. User will provide the first auction platform's CSV specs at planning time.
>
> **For the full v1 + beyond phase plan, see [`docs/roadmap.md`](docs/roadmap.md).** This file (`STATE.md`) is the live tracker for the current branch + immediate next steps; the roadmap doc is the higher-altitude view of all remaining phases through v1 cutover and into v1.5.

## Phase 3 status: ✅ signed off

| Item | Status |
|---|---|
| Code (plan tasks A–G) | ✅ done |
| Vitest suite | ✅ 144 tests passing (was 105 after Phase 2; +39 in Phase 3 incl. sign-off additions and warehouse-permission tests) |
| Migrations applied to Dev + Test | ✅ done — `0007_lot_photos_storage_policies.sql`, `0008_lot_source_and_photo_constraint.sql` |
| Vercel preview deploy | ✅ Ready — latest at sign-off `auction-dwenm678o-vantheos-4047s-projects.vercel.app` (run `vercel ls auction-os` for current) |
| Cataloging session URL persistence | ✅ shipped — pull-to-refresh / browser back / tab close+reopen all preserve in-progress lot |
| Vercel cache headers (HTML no-cache, hashed assets immutable) | ✅ shipped — testers no longer need manual cache clear per deploy |
| iOS Safari/Chrome quirks | ✅ all handled — dvh, safe-area-inset-bottom, auto-zoom restoration, scroll containment |
| Warehouse permissions | ✅ aligned with v1 design spec — can edit fields, can move/assign, can delete own active cataloging lot, cannot change state via PATCH, no inventory bulk affordances |
| Manual sign-off click-through Sections A–F | ✅ all in-scope items verified |
| Test data seeded to Dev | ✅ 6 test lots in `Test Estate / 2026-04-Test-001` + 1 unassigned Mystery Item |
| **Carry-forwards** (explicitly agreed deferrals — NOT blockers) | 🟡 see below |

**Phase 3 commits ahead of `phase-2-lot-lifecycle`** (`git rev-list --count phase-2-lot-lifecycle..HEAD`): 38 commits.

## Phase 3 sign-off bug fix batch

User-driven manual click-through against the preview surfaced a long list of issues across React Query cache invalidation, form state handling, role permissions, mobile rendering, and design-spec divergence. All resolved on `phase-3-mobile-cataloging`.

| # | Issue | Resolution | Commit(s) |
|---|---|---|---|
| 1 | Mutation cache invalidation broken (`['lots']` vs `['lots-infinite']`) — list never refetched after edit/delete; toasts missing for single-lot mutations; T-A6/A8/A10 | Replaced `['lots']` with `['lots-infinite']` in all mutation hooks; deleted dead `useLots` list hook; wired success+error toasts in LotDetail | `4a6bb8b` |
| 2 | Removed impossible `unassigned → assigned` transition from state machine (was 500ing on bulk + single via PATCH due to schema CHECK); Move endpoint now serves both | State machine cleanup in both `api/_lib/lot-state.ts` and `src/hooks/useLotState.ts`; Move button visible for both states; bulk handlers gain try/catch | `303a998` |
| 3 | "Move to another auction" → "Assign to Job" rename; bulk action bar Move → "Assign to Job"; dialog titles + reprint checkbox copy | One push of consistent renames | `a1a08ef` |
| 4 | Sidebar trim (-30%, w-56 → w-40); DevTools open broke vertical scroll (min-h-screen + body height:100% trapped overflow); /catalog had no rail nav (was standalone); /catalog/session picker used radio lists not dropdowns | AdminShell `min-h-screen` → `h-screen`; /catalog moved into AdminShell route group; CustomerJobPicker rewritten with native `<select>` | `a6917a6` |
| 5 | T-A4 — no way to add photos to existing lots from the desktop modal | Reused `PhotoStrip` + `PhotoManager` in `LotDetail` (frozen lots show static grid); inline render not portal so Radix Dialog click detection works | `db5c3ac`, `3fd3ede` |
| 6 | PhotoManager invocation diverged: route-based for cataloging, callback-based for LotDetail | Unified to inline-callback pattern; deleted `/catalog/session/photos` route + `CatalogPhotos.tsx`; PhotoManager decoupled from `useCatalogSession` via optional `onLotDeleted` callback | `9981373` |
| 7 | T-C1 — sign-out from /inventory left URL with `?redirect=/inventory`; warehouse logged in honored that and landed on /inventory not /catalog | AdminShell sign-out button navigates to clean `/login` BEFORE calling signOut() | `7c576c2` |
| 8 | Lot detail modal not scrollable on desktop; tall content extended off-screen | Added `max-h-[90vh] overflow-y-auto` to shared DialogContent primitive | `7c576c2` |
| 9 | Photo upload took 30-45s to render thumbnail (blank flicker between blob URL and signedUrl) | upload-processor invalidates `['lot-photos', lotId]` after `flipStatus` PATCH BEFORE `dequeueUpload` (awaited) | `e2a72a3` |
| 10 | Supabase image transform was horizontally cropping despite docs saying width-only preserves aspect ratio | Added explicit `resize: 'contain'` to `bulkSignReadUrls` call for the photos GET endpoint | `ace87cf` |
| 11 | Closing lot detail modal silently discarded unsaved field edits | Added unsaved-changes warning dialog gating Dialog X / Escape / outside-click / Close button via guarded close | `9edf58d` |
| 12 | Warehouse couldn't edit fields, move, or delete (server returned 403); spec said warehouse SHOULD edit fields per UI design | Server PATCH allows warehouse for non-state edits, rejects state changes; Move allows warehouse; DELETE allows warehouse for own intake AND state='assigned' lots; UI gates inventory bulk affordances entirely off for warehouse; LotDetailPage canEdit lifted | `5276d00` |
| 13 | T-D6 — mobile fullscreen modal action buttons unreachable on iPhone; Tailwind `.text-sm` class beat global font-size rule, iOS auto-zoom didn't restore on blur | Mobile UI audit: `vh` → `dvh` everywhere applicable, `safe-area-inset-bottom` padding on overlays, `!important` on global font-size rule. Mobile UI checklist saved as `feedback_mobile_ui_checklist.md` | `13a2e78` |
| 14 | "Additional Info" collapse missing from LotInProgress (per option-c-flow spec §363); customer/job not in cataloging session header | Restored chevron-expandable section hiding Title/Description/Price/Ref1/Ref2; header now shows customer name + job number; PendingUploadsIndicator moved below photo strip | `0c89d49` |
| 15 | Save Changes had no visible toast on mobile/desktop because Toaster was at z-50 same as Dialog (Dialog covered Toaster) | Toaster bumped to z-[60] | `30dbe63` |
| 16 | Vercel cache headers — iOS Safari was caching HTML aggressively, testers saw stale builds without manual cache clear | `vercel.ts` adds explicit Cache-Control: HTML no-cache/must-revalidate; assets immutable max-age=31536000 | `90a46b6` |
| 17 | Pull-to-refresh wiped cataloging session display (lotId in component state lost on remount); user thought data was lost and might end session in panic | Persist lotId in URL via setSearchParams; restored on mount; advance/discard/setLot keep URL in sync | `85ef610` |
| 18 | LotEditForm "Invalid" save toast — empty `price=""` passed client schema (.or(z.literal(''))) but rejected server-side regex; also LotEditForm still showed "old" form layout without Additional Info collapse | LotEditForm restructured to match cataloging design (Quantity+Untested row, full-width Special Notes, Additional Info collapse with optional fields); handleValid normalizes empty strings to null before onSubmit | `425c491` |
| 19 | Quantity stepper had invisible "+" button on user's device | Replaced with plain `<input type="number" inputMode="numeric">` matching LotEditForm style | `1fa589a` |
| 20 | Quantity input couldn't be backspaced (controlled `Math.max(1, ... \|\| 1)` snapped back to 1 every keystroke); typing replaced got concatenated | Local string mirror state for free editing; clamp+commit only on blur; useEffect syncs from non-input sources | `f83043f` |

**Spec amendments captured during Phase 3 sign-off:**
- `unassigned → assigned` transition removed from PATCH state machine — Move endpoint is the only path (state_tuple_consistent CHECK constraint can't be satisfied via state-only PATCH). v1 spec §3 + Phase 3 design §4 + role.ts comments updated.
- Warehouse permission matrix expanded per UI design spec line 332 ("Office or Warehouse can edit AI output"): warehouse can edit non-state fields, move, and delete own active cataloging lot. Server tests rewritten accordingly.
- "auction" → "Job" terminology adopted in user-facing UI (buttons, dialog titles); internal naming (file names, hook names, API routes, action discriminators) unchanged.
- Dialog scrollability and mobile-fullscreen behavior locked into the shared `DialogContent` primitive.
- iOS Safari/Chrome compatibility: `100dvh` over `100vh`, `env(safe-area-inset-bottom)` on full-screen overlays, `!important` on the mobile font-size rule. Documented as mobile UI checklist memory rule.

## Phase 3 carry-forward outcomes (resolved 2026-05-03 during roadmap planning)

| ID | Item | Resolution |
|---|---|---|
| T-G1 | Physical Zebra ZD450 round-trip test | → **Phase 7** (Label printing) |
| T-G2 | Audit-log SQL spot-check | → **Phase 8** (Cutover) step 4 |
| T-G3 | AI subsystem (title/description/reference price generation) | → **Phase 6** (AI subsystem) |
| ~~T-G4~~ | ~~/users admin UI~~ | **CLOSED 2026-05-03** in Phase 4 commit `0a81933`. List + add + role change with confirm + disable/re-enable with confirm. No hard delete in UI per spec §3.2. |
| T-G5 | Audit reporting view | → **v2** (Reporting module) |
| ~~T-G6~~ | ~~First-run / empty states polish~~ | **ELIMINATED** — single-tenant hands-on install per client; practical value too low |

## Phase 3.5 status: ✅ signed off (2026-05-02 late evening)

**Spec:** `docs/superpowers/specs/2026-05-02-phase-3-5-design.md`
**Branch:** `phase-3-5-test-infra` at `aff9716`, 5 commits ahead of `phase-3-mobile-cataloging`.
**Effort actual:** Single sitting; estimate was ~2.5 days.

| Item | Status |
|---|---|
| Vitest suite | ✅ 181 tests passing (was 144 after Phase 3; +37 in 3.5: 4 helper-test infra, 6 patterns, 19 backfill, 4 stateTransitionFields, 4 LotDetail state/move toast, 2 upload-processor permanent/cap) |
| Vitest workspace split (api/client projects) | ✅ shipped — `vitest.workspace.ts` |
| Client test deps | ✅ `@testing-library/{react,user-event,jest-dom}`, `happy-dom` |
| Helpers | ✅ `render-with-providers.tsx`, `mock-api.ts`, `fixtures.ts`, `setup-api.ts`, `setup-client.ts` |
| Canonical patterns (4 files) | ✅ `tests/client/patterns/01-04-*.test.tsx` |
| Backfill regression tests (C1-C9) | ✅ 7 test files / 19 tests, mirroring the Phase 3 sign-off bug classes |
| Server helper extraction (E) | ✅ `stateTransitionFields()` in `api/_lib/lot-state.ts`; both single PATCH and bulk change-state use it |
| Going-forward policy doc | ✅ `docs/testing-policy.md` |
| Pattern catalog doc | ✅ `docs/testing-patterns.md` |
| Lint | ✅ 0 errors, 0 warnings |
| Build | ✅ clean, 5.37s; bundle output unchanged from main |

**Spec deviations captured during execution:**
- A's `environmentMatchGlobs` approach (single config) didn't survive `singleFork: true` — happy-dom's globalThis install doesn't reliably reset between mixed node/dom files in one fork. Pivoted to `vitest.workspace.ts` with two projects (api: node + singleFork; client: happy-dom). Same outcome as spec, different mechanism.
- Setup file split forced by the workspace pivot: `setup-api.ts` (dotenv + JWKS) and `setup-client.ts` (jest-dom matchers + RTL cleanup + unhandled-rejection silencer for the intentional RHF re-throw pattern).
- `renderHookWithProviders` added to the helper (not in original spec) — needed by pattern 02 since useMutation hooks can't be tested through `render()` alone.
- C4 (LotDetail toast wiring) covers save + delete paths only; state-change and move share the same wiring shape, deferred per `docs/testing-policy.md` known gaps until those flows are touched.
- C9 (upload-processor invalidation timing) shipped successfully — the OOM I hit on the first attempt was a mock-state issue (idb queue mock returned the same entry forever), fixed by mutating shared queue state in the mock.

## Phase 3.5 carry-forwards (DEFERRED — explicitly agreed)

| ID | Item | Status |
|---|---|---|
| ~~T-3.5-G1~~ | ~~LotDetail state-change + move toast tests~~ | **CLOSED 2026-05-02** — written in commit `e271015`. All four single-lot mutation paths now have success + failure toast assertions. |
| ~~T-3.5-G2~~ | ~~upload-processor retry/backoff path tests~~ | **CLOSED 2026-05-02** — written in commit `e271015`. Permanent-failure and transient cap-reached paths tested. Source bug found and fixed in same commit: cap-promotion path was missing `invalidateQueries`, inconsistent with success/permanent paths. Under-cap retry-schedule path remains explicitly untested (mechanical timer choreography); see `docs/testing-policy.md` known gaps. |
| T-3.5-G3 | Playwright e2e for golden-path flows | → **v1.5** (Playwright phase). Decoupled from AI during Phase 4 grouping discussion — AI is mostly backend with minimal new UI surface, so Playwright value is independent and earned its own slot. |

## Phase 4 status: ✅ signed off (2026-05-03 late evening)

**Spec:** [`docs/superpowers/specs/2026-05-03-phase-4-design.md`](docs/superpowers/specs/2026-05-03-phase-4-design.md)
**Branch:** `phase-4-settings-users` at `fc2bb25`, 7 commits ahead of `phase-3-5-test-infra`.
**Actual effort:** Single sitting. Estimate was ~3.5 days.

| Item | Status |
|---|---|
| Vitest suite | ✅ 214 tests passing (was 181 after Phase 3.5; +33 in Phase 4: 9 Area 1, 12 Area 2, 8 Area 3, 4 Area 5) |
| Migrations applied to Dev + Test | ✅ `0009_jwt_hook_check_disabled.sql`, `0010_ai_schedule_interval_hours.sql` |
| Area 1 — JWT hook gate + last-admin protection | ✅ commit `b6b771a` |
| Area 2 — `/users` admin UI | ✅ commit `0a81933` |
| Area 3 — AI Schedule panel + integer-hours schema | ✅ commit `4704c06` |
| Area 4 — drop Organization placeholder | ✅ commit `d356361` |
| Area 5 — Customers/Jobs polish + customer search | ✅ commit `0656c97` |
| Lint | ✅ 0 errors, 0 warnings |
| Build | ✅ clean, ~5.3s |
| Manual sign-off click-through | ✅ all 7 acceptance items pass |

## Phase 4 manual sign-off bug fix batch

User-driven manual click-through against the preview surfaced 2 real bugs and revealed 1 race condition I introduced while fixing the second. All resolved on `phase-4-settings-users`.

| # | Issue | Resolution | Commit |
|---|---|---|---|
| 1 | New-user toast persisted across logout/login. `durationMs: 0` (manual dismiss only) survived sign-out because toast state lives in App-level React state; navigate to `/login` doesn't unmount the app. Next user landed on their page seeing the previous user's "User created" toast. | `Users.tsx` durationMs 0 → 30000; added `clearAll()` to ToastCtx; `AdminShell.handleSignOut` calls `clearAll()` as a backstop for any future persistent toasts. | `ff84514` |
| 2 | Disabled user attempting to sign in hung on Loading indefinitely. Supabase auth still succeeds for disabled users (auth.users isn't gated — only app_user.disabled_at); JWT carries app_metadata.role=null because of the gated hook; `RoleHomeRedirect` early-returns on null role. | `ProtectedRoute` detects "session present + role null" → fires `signOut()` and Navigate to `/login?inactive=1`; `Login.tsx` reads `?inactive=1` and shows "This account has been disabled. Contact an admin to regain access." | `ff84514` |
| 3 | Race condition introduced in commit `ff84514` — every user got bounced to `/login?inactive=1` on first mount. Cause: `ProtectedRoute` called `useSession()` AND `useRole()` (which internally calls `useSession()` again); each instance has its own async resolution. Briefly, outer instance had session=present + loading=false while inner instance still had session=null → role evaluated to null → disabled-detection fired for every user. | Extracted pure `roleFromSession(session)` helper from `useRole`; `ProtectedRoute` now derives role from the SAME session it's already reading. Single source of truth, no race. | `fc2bb25` |

**Deviations captured during execution:**
- Area 1 last-admin protection extended to cover role-demote (not just disable). Same intent: don't leave the system without an active admin. Used generic `CANNOT_REMOVE_LAST_ADMIN` error code instead of disable-specific name. Small spec extension; documented in commit message.
- Area 2 add-user toast set to `durationMs: 30000` after sign-off testing (originally `durationMs: 0`). 30s is plenty for password capture; doesn't survive sign-out.
- `roleFromSession` helper added to `src/lib/auth.ts` as fallout of the race-condition fix. Useful for any future component that needs the role of a session it's already holding without subscribing again.

## Next: Phase 5 — Auction Platform Export

**Spec to be drafted** via top-down discussion at the start of the next session. Captured decisions (column mapping shape Option B, default platform seeded from real specs, image upload deferred) live in [`docs/roadmap.md`](docs/roadmap.md) Phase 5 section. User will provide the first auction platform's CSV specs at planning time.

## Phase 2 status: ✅ signed off (2026-05-01)

| Item | Status |
|---|---|
| Code (39 plan tasks, A–H) | ✅ done |
| Vitest suite | ✅ 105 tests passing |
| Migration `0006_system_settings_label_printer.sql` | ✅ applied to Dev + Test |
| Vercel Pro upgrade (Hobby's 12-function cap exceeded at 15) | ✅ user upgraded mid-flight |
| Vendor chunk splitting | ✅ main chunk ~178 KB |
| Manual sign-off click-through | ✅ 11 issues found + all resolved |
| Physical-printer round-trip test | 🟡 deferred → carried forward to T-G1 |
| Audit-log spot-check | 🟡 deferred → carried forward to T-G2 |

## Phase 1 status: ✅ signed off (2026-04-30)

22 plan tasks, 21 vitest API tests, 5 migrations applied, JWT custom-claim hook activated. Two latent bugs caught + fixed during preview testing (extensionless ESM imports, Hono on Vercel hung POST bodies — see `feedback_avoid_hono_on_vercel.md`).

## Branch state

| | Local | GitHub |
|---|---|---|
| `main` | `7bbeee0` (36 commits — same as Phase 1 sign-off point) | same |
| `phase-1-foundation` | `70cc776` (43 commits) | same |
| `phase-2-lot-lifecycle` | `a517f9d` (signed off; 67 commits ahead of phase-1) | same |
| `phase-3-mobile-cataloging` | `7d15a35` (signed off; 38 commits ahead of phase-2) | same |
| `phase-3-5-test-infra` | `7218165` (signed off; 11 commits ahead of phase-3) | same |
| `phase-4-settings-users` | `fc2bb25` (signed off; 7 commits ahead of phase-3-5) | same |

`main` unchanged from original Phase 1 deploy point. Per branch strategy memory rule, we never push to `main` until v1 cutover.

**Repo-local git config in force** (do NOT change):
- `user.name = Vantheos`
- `user.email = ops@vantheos.com`

## Vercel project state

- Project: `vantheos-4047s-projects/auction-os`
- GitHub integration: connected to `Vantheos/auction-os`
- Production branch: `main`
- Preview: any unassigned branch (currently `phase-3-mobile-cataloging`)
- Env vars: 18 across production/preview/development scopes
- **Cache headers** (added 2026-05-02): HTML no-cache/must-revalidate; `/assets/(.*)` immutable max-age=31536000

## Phase 8 — v1 cutover checklist (a.k.a. "what must happen before Prod is real")

**Strict ordering — not flexible.** Supabase bootstrap requirements constrain the sequence.

1. Apply migrations to Prod: `npx supabase db push --db-url "$PROD_DATABASE_URL"`
2. Activate JWT Claims Hook in Prod's Supabase dashboard
3. Run `npm run seed:admin` against Prod (with `.env` pointed at Prod) — creates the bootstrap admin
4. **T-G2** — audit-log SQL spot-check via Supabase Dashboard SQL Editor on Prod (verify the audit trigger fires correctly with the right `user_id` + before/after fields)
5. **Change the seeded admin's default password** before non-test use
6. Open the app to real users — admin uses Settings → Users (built in Phase 4) to add Office and Warehouse users
7. Promote final pre-cutover branch → `main` via merge; Vercel deploys to Prod via the existing Git webhook

**T-G1** (physical Zebra ZD450 round-trip test) lands in Phase 7 (Label printing), not in this cutover sequence — runs whenever the hardware is on hand. Must be done before cutover, but the test itself is a Phase 7 deliverable.

## Working tree note

Clean (`git status` reports nothing tracked drifting). Sign-off batch fully committed.

## Known recovery procedures

### Blank screen on Vercel preview deploy
**Cause:** Vercel project missing `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`. `src/lib/supabase.ts` throws at module-load.
**Fix:** `vercel env ls` → if missing, `npm run env:setup` → push empty commit to retrigger build.

### Probing a fresh deploy
`npm run probe:preview <url>` — uses `vercel curl` to GET `/api/health` and assert 200, plus auth-protected endpoints respond 401. Run this after every push.

### iPhone Safari / Chrome cache
Now handled by the explicit cache headers in `vercel.ts`. If a tester still sees a stale build:
- Pull-to-refresh on the preview URL
- Open in Private tab
- Settings → Safari → Advanced → Website Data → swipe-delete the auction site

## Files of record

| File | Purpose |
|---|---|
| `STATE.md` | This file — live tracker |
| `.env.setup` | Real credentials for the three Supabase projects (gitignored) |
| `.env`, `.env.test` | Auto-generated by `npm run env:setup` (gitignored) |
| `.gitignore` | Protects `.env*`, `.vercel/`, `node_modules/`, `*.tsbuildinfo` |
| `.claude/settings.json` | Project allowlist (read-only Bash + MCP read tools) — TRACKED |
| `.claude/settings.local.json` | User-private allowlist — gitignored |
| `package.json` | Phase 1-3 deps (Hono removed); scripts incl. `env:verify`, `env:setup`, `dev`, `build`, `typecheck`, `test`, `seed:admin`, `seed:test-lots`, `db:generate`, `db:push`, `probe:preview` |
| `vercel.ts` | Build/runtime config, SPA fallback rewrite, cache headers, cron schedule |
| `vite.config.ts`, `tailwind.config.ts`, `postcss.config.js`, `vitest.config.ts`, `vitest.workspace.ts`, `playwright.config.ts` | Build/test config (workspace splits api + client vitest projects) |
| `src/styles/globals.css` | Global CSS incl. mobile font-size enforcement (16px !important under 767px) |
| `src/components/ui/dialog.tsx` | Shared Dialog primitive with `fullScreenOnMobile`, `max-h-[90vh]`, `dvh`, safe-area-inset-bottom |
| `src/components/ui/toast.tsx` | Toaster at z-[60] (above Dialog) |
| `src/components/ui/sheet.tsx` | Mobile filter drawer with dvh + safe-area-inset-bottom |
| `src/hooks/useCatalogSession.ts` | Session state with URL persistence for lotId |
| `src/hooks/useLotMutations.ts` | Single-lot mutations (update / change-state / move / delete) — invalidates `['lots-infinite']` |
| `src/hooks/useBulkLotAction.ts` | Bulk mutations endpoint — invalidates `['lots-infinite']` and `['lot']` |
| `src/lib/upload-processor.ts` | Photo upload queue processor — invalidates lot-photos before dequeue |
| `src/lib/query.ts` | QueryClient singleton (staleTime 30s, refetchOnWindowFocus false) |
| `src/components/catalog/LotInProgress.tsx` | Cataloging session screen — Additional Info collapse, customer/job header, free-form quantity |
| `src/components/catalog/PhotoStrip.tsx`, `PhotoManager.tsx` | Reused across cataloging + LotDetail |
| `src/components/lot/LotEditForm.tsx`, `LotDetail.tsx` | Inventory edit form with Additional Info collapse, empty-string normalization, unsaved-changes guard |
| `src/routes/Inventory.tsx` | Inventory list — bulk gate for warehouse, unsaved-changes confirm dialog |
| `api/_lib/lot-state.ts` | State machine (server) — `unassigned` only transitions to `not-sellable` |
| `api/lots/[id].ts` | Single-lot GET/PATCH/DELETE — warehouse-aware role gating |
| `api/lots/[id]/move.ts` | Move endpoint — admin/office/warehouse |
| `api/lots/bulk.ts` | Bulk operations — admin/office for change-state/move; admin only for delete |
| `api/_lib/storage.ts` | Supabase storage helpers — `Transform` type incl. `resize` |
| `api/lots/[id]/photos.ts` | Photos GET with `resize: 'contain'` to preserve aspect ratio |
| `supabase/config.toml`, `supabase/migrations/0000-0010*.sql` | 11 migrations (Phase 1: 5, Phase 2: 1, Phase 3: 2, Phase 4: 2 — JWT hook gate + AI schedule integer hours, Phase 3.5 added no migrations) |
| `src/routes/Users.tsx`, `src/hooks/useUsers.ts` | Phase 4 — `/users` admin UI + hooks (CRUD via existing `/api/users` endpoints) |
| `api/users/index.ts` | List enriched with email via Supabase admin client; POST creates auth.users + app_user atomically |
| `api/users/[id].ts` | PATCH with self-disable rejection + last-admin protection (Phase 4 Area 1) |
| `src/lib/auth.ts` | `useSession`, `useRole`, `roleFromSession` (Phase 4 race-fix helper); `signIn` / `signOut` |
| `src/components/auth/ProtectedRoute.tsx` | Disabled-session detection + Navigate to `/login?inactive=1` (Phase 4) |
| `tests/api/*.test.ts`, `tests/lib/*.test.ts`, `tests/helpers/*.ts` | API project: 153+ tests (node env, singleFork for DB serialization). +9 in Phase 4 Area 1 (JWT hook + user policy). |
| `tests/client/**/*.test.tsx`, `tests/client/patterns/*.test.tsx` | Client project: 55+ tests (happy-dom env). +12 in Phase 4 Area 2 (Users hooks + components), +8 in Area 3 (Settings hook + AI schedule panel), +4 in Area 5 (Customers polish). |
| `tests/helpers/render-with-providers.tsx`, `mock-api.ts`, `fixtures.ts`, `setup-api.ts`, `setup-client.ts` | Test infrastructure (Phase 3.5) |
| `docs/superpowers/specs/` | All design specs (2026-04-29 v1 design, 2026-04-30 phase-2, 2026-05-01 phase-3, 2026-05-02 phase-3.5) |
| `docs/superpowers/plans/` | Phase 1, 2, 3 implementation plans (historical record) |
| `docs/testing-policy.md` | Going-forward testing policy from Phase 3.5 (new mutation hook → hook test required) |
| `docs/testing-patterns.md` | Canonical client test pattern catalog from Phase 3.5 |
| `docs/roadmap.md` | Higher-altitude v1 + beyond plan — completed phases, Phase 4-8 outlines, v1.5/v2, carry-forward index. **Restructured 2026-05-03** to formally place every carry-forward into a phase. |

## Key user preferences (in memory under `~/.claude/projects/d--Dev-auction-os/memory/`)

- Top-down spec process; one focused round per area
- File-based feedback for substantive input
- Mention CWD only when it matters
- Validate environment before running commands (env vars, tool presence, auth state)
- Phase-branch workflow; never push master until v1 complete
- Let Vercel manage deploys via Git webhook (never run `vercel deploy`)
- Verify before directing — never guess at UI / CLI / file locations
- Repo-local git author is `Vantheos <ops@vantheos.com>` for auction-os
- Avoid Hono on Vercel — use native (req, res) handlers
- v1 cutover is not an alternative to phase work
- Spec is a snapshot, not a constraint — propose better approaches when they emerge
- Pre-push trio (build + lint + test) ALL green before any push
- No deferred quality issues for auction-os
- Phase sign-off requires clean state (lint 0/0, build green, test green, no undiscussed items)
- Validate speculative benefits before listing them in option analysis
- Mobile UI checks (dvh, safe-area, auto-zoom, touch targets, hover, scroll, keyboard, tap feedback) standard for any mobile UI work
