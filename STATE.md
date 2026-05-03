# Working state — Auction Inventory SaaS

> Last updated 2026-05-02 evening. **Phase 3 (Mobile cataloging + photo pipeline + login routing + role gating + cleanup-orphan-lots cron) signed off** after thorough sign-off testing across Sections A through F. 144/144 vitest suite green; lint 0/0; build clean. Branch `phase-3-mobile-cataloging` at `f83043f`, 38 commits ahead of `phase-2-lot-lifecycle`. **Next:** Phase 3.5 — client test infrastructure (spec at `docs/superpowers/specs/2026-05-02-phase-3-5-design.md`).

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

## Phase 3 carry-forwards (DEFERRED — explicitly agreed)

| ID | Item | Status |
|---|---|---|
| T-G1 | Physical Zebra ZD450 round-trip test | Defer until hardware on hand; **mandatory before Prod cutover** |
| T-G2 | Audit-log SQL spot-check | Defer to Prod cutover (Dev/Test/Prod each have their own DB; Dev check wouldn't replace Prod check). Run via Supabase Dashboard → SQL Editor |
| T-G3 | AI subsystem (title/description/reference price generation) | Phase 4 |
| T-G4 | /users admin UI | Later phase (v1.5 candidate) |
| T-G5 | Audit reporting view | Later phase |
| T-G6 | First-run / empty states polish | Pre-Prod cutover polish PR |

## Next: Phase 3.5 — Client test infrastructure

**Spec:** `docs/superpowers/specs/2026-05-02-phase-3-5-design.md` — drafted with **expanded scope** as of 2026-05-02 evening.
**Status:** Drafted, NOT started. Branch `phase-3-5-test-infra` to be created off `phase-3-mobile-cataloging` when starting.
**Effort:** ~2.5 days.

5 workstreams:
- **A.** Test infrastructure setup (vitest env switch, `@testing-library/react` + `happy-dom`, `mockApi` helper, `render-with-providers` helper). 0.5 day.
- **B.** Canonical reference patterns (query invalidation, optimistic update + rollback, error toast wiring, role-gated render). 0.5 day.
- **C.** Backfill regression tests for 9 bugs from the Phase 3 sign-off batch (expanded from original 4). ~1 day.
- **D.** Going-forward rule (new mutation hook → hook test required). 0.25 day.
- **E.** Server-side helper extraction (shared state-transition logic between single PATCH and bulk change-state). 0.25 day.

Playwright e2e deliberately deferred to Phase 4 (rationale in spec §4).

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
| `phase-3-mobile-cataloging` | `f83043f` (signed off; 38 commits ahead of phase-2) | same |

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

## What still must happen before Prod is real (deferred to v1 cutover)

1. Apply 8 migrations to Prod Supabase: `npx supabase db push --db-url "$PROD_DATABASE_URL"`
2. Activate JWT Claims Hook in Prod's Supabase dashboard
3. Run `npm run seed:admin` against Prod (with `.env` pointed at Prod)
4. **Change the seeded admin's default password** before non-test use
5. Run T-G2 audit-log spot-check via Supabase Dashboard SQL Editor on Prod
6. Run T-G1 physical Zebra round-trip test (requires hardware on hand)
7. Apply T-G6 first-run / empty-states polish

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

## Resume prompt (paste verbatim into a new context window)

> Welcome back. Read `STATE.md` first. Phase 3 of auction-os is **fully signed off** (2026-05-02 evening). The next thing to do is **Phase 3.5 — Client test infrastructure**, spec at `docs/superpowers/specs/2026-05-02-phase-3-5-design.md` (expanded scope as of 2026-05-02 evening).
>
> **Phase 3.5 plan:** 5 workstreams (A test infra → B canonical patterns → C backfill 9 regression tests → E server helper extraction → D going-forward rule docs). ~2.5 days estimated. Branch `phase-3-5-test-infra` to be created off `phase-3-mobile-cataloging` when starting.
>
> **Carry-forwards from Phase 3** (DO NOT TOUCH unless user brings up):
> - T-G1 Physical Zebra ZD450 — defer until hardware on hand; mandatory before Prod
> - T-G2 Audit-log SQL spot-check — defer to Prod cutover
> - T-G3 AI subsystem — Phase 4
> - T-G4 /users admin UI — later phase
> - T-G5 Audit reporting view — later phase
> - T-G6 First-run / empty states polish — pre-Prod cutover polish PR
>
> **Branch state:** `phase-3-mobile-cataloging` at `f83043f`, 38 commits ahead of `phase-2-lot-lifecycle`. `main` unchanged from Phase 1 sign-off point. Per branch strategy memory rule, NEVER push to `main` until v1 cutover.
>
> **Companion docs:**
> - `docs/superpowers/specs/2026-05-02-phase-3-5-design.md` — Phase 3.5 spec (expanded scope)
> - `docs/superpowers/specs/2026-05-01-phase-3-design.md` — Phase 3 spec (signed off)
> - `docs/superpowers/specs/2026-04-29-v1-design.md` — overall v1 design (authoritative for product decisions)
> - `~/.claude/projects/d--Dev-auction-os/memory/MEMORY.md` — feedback rules + project memory
>
> **Critical memory rules to honor** (these override defaults):
> - Always run pre-push trio (build + lint + test, all green, lint 0/0)
> - Phase work goes on `phase-N-<slug>` branches; never push `main` until v1 complete
> - Repo-local git author is `Vantheos <ops@vantheos.com>` — do NOT change
> - Validate before directing — never guess at UI / CLI / file locations
> - Mobile UI checks (dvh, safe-area, auto-zoom, touch targets, etc.) standard for any mobile UI work — see `feedback_mobile_ui_checklist.md`
> - Don't offer "minimal" or workaround fixes; default to the proper fix
> - Validate speculative benefits before listing them in option analysis
>
> **What to do first:** Confirm Phase 3.5 spec scope is still aligned with user expectation. If yes, propose the start of workstream A (test infra setup) and ask for green light to create the new branch + add deps. Do NOT start implementation without explicit go-ahead — the user prefers top-down confirmation before each major chunk.

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
| `vite.config.ts`, `tailwind.config.ts`, `postcss.config.js`, `vitest.config.ts`, `playwright.config.ts` | Build/test config |
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
| `supabase/config.toml`, `supabase/migrations/0000-0008*.sql` | 8 migrations (Phase 1: 5, Phase 2: 1, Phase 3: 2) |
| `tests/api/*.test.ts`, `tests/lib/*.test.ts`, `tests/helpers/*.ts` | 144 tests (server-side only — Phase 3.5 will add `tests/client/`) |
| `docs/superpowers/specs/` | All design specs (2026-04-29 v1 design, 2026-04-30 phase-2, 2026-05-01 phase-3, 2026-05-02 phase-3.5) |
| `docs/superpowers/plans/` | Phase 1, 2, 3 implementation plans (historical record) |

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
