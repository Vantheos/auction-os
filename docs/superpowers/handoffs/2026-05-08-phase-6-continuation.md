# Phase 6 — continuation handoff for the next session

> Created 2026-05-08, refreshed 2026-05-09 end of session. The user is
> mid-test on the deployed preview. This session is reactive — listen
> for findings, propose fixes, push, repeat. No major new feature work
> is queued.

## How to use this doc

Open the next session with:

> **"read `docs/superpowers/handoffs/2026-05-08-phase-6-continuation.md`, then I'll continue with testing findings."**

Before any code change, read [`docs/dev-notes.md`](../../dev-notes.md) — it
captures gotchas accumulated over multiple sessions (Zod 3/4 SDK
mismatch, mobile filter parallel components, eligibility-definition
consistency across three surfaces, lot-number sequence + compact, the
`unhandledRejection` listener leak gotcha, etc.). The project-level
[`CLAUDE.md`](../../../CLAUDE.md) also points there.

## Branch state

- **Branch:** `phase-6-ai-subsystem` at HEAD `6bc4820` — pushed to
  GitHub. Vercel preview is the latest.
- **`ANTHROPIC_API_KEY`:** set in Vercel (production + preview).
- **Migrations applied to Dev + Test:** through `0014`
  (`label_reprint_needed` boolean on `lot`).
- **Pre-push trio at last push:** build clean (~6s), lint 0/0,
  **581/581 tests** (was 539 at the start of this session).
- **STATE.md:** still reflects Phase 5 sign-off. Phase 6 section gets
  added once manual click-through is complete.
- **Author email:** repo-local git config is `Vantheos <ops@vantheos.com>`.
  Wrong email → Vercel rejects.

## Authoritative documents

- **Original Phase 6 sign-off handoff** (entry doc, partly stale):
  [`2026-05-06-phase-6-signoff.md`](2026-05-06-phase-6-signoff.md).
  Read this for full Phase 6 context if needed.
- **Spec:** [`docs/superpowers/specs/2026-05-06-phase-6-design.md`](../specs/2026-05-06-phase-6-design.md).
  Multiple amendment blocks added during prior sessions. **Code is
  authoritative when the spec disagrees.**
- **End-to-end test checklists** (Phases 1–6, no cron):
  - Balanced (~2-3 hr): [`2026-05-08-e2e-balanced.md`](2026-05-08-e2e-balanced.md)
  - Exhaustive (~half-day): [`2026-05-08-e2e-exhaustive.md`](2026-05-08-e2e-exhaustive.md)
- **Cron + prod-only items deferred:** [`prod-cutover-test-checklist.md`](prod-cutover-test-checklist.md).
- **AI prompt review:** [`2026-05-08-ai-prompt-review.md`](2026-05-08-ai-prompt-review.md).
- **Roadmap:** [`docs/roadmap.md`](../../roadmap.md). "AI improvement
  track" under Beyond v1.
- **Dev notes (READ THIS):** [`docs/dev-notes.md`](../../dev-notes.md).

## What shipped this session (since `e020069`)

Newest commits first. See `git log e020069..HEAD` for full messages.

| Commit | Area | What |
|---|---|---|
| `6bc4820` | tests | Fix `unhandledRejection` listener leak in setup-client.ts (was causing intermittent ~123-failure cascades; details in dev-notes). Real root cause; not parallelism. |
| `e661202` | tests | Cap client thread pool at 2 (cascade-mitigation attempt before listener-leak fix; kept as a modest cap). |
| `845c42d` | labels | `useLabelPrint.onSettled` invalidates `['lots-infinite']` and `['lot', id]` so the Reprint pill clears after the server-side flag clear. |
| `9790264` | photo-manager | `h-full` + image scaling so the action bar is reachable inside the inventory Dialog, and the image uses available space. |
| `725cad9` | docs | E2E-balanced checklist progress checkmarks (Section A through A.6). |
| `f2266d3` | chore | Untrack `docs/user-guide/` (operator authors locally; files stay on disk via `.gitignore`). |
| `a803431` | catalog | `useCatalogSession` derives `lotId` from URL instead of useState — fixes EndSessionConfirm `hasInProgressLot=false` bug across hook callers. |
| `9c1df98` | docs | User-guide content (operator-authored; subsequently untracked). |
| `63a6b40` | jobs | Compact-lots endpoint + pre-export modal + Reprint pill + filter chip. Migration 0014 added `label_reprint_needed` boolean. |
| `e66c2de` | inventory | Lot-number allocation fills lowest gap before extending past max. EndSession wording fix bundled. |
| `f1b670c` | inventory | Full-text search (title + description, ILIKE OR'd). Desktop above the chip row, mobile always-visible above the Filter button. |
| `816a163` | docs | New E2E balanced + exhaustive checklists. Old Phase 6 manual checklist deleted; cron items moved to prod-cutover-test-checklist. |
| `59657e5` | phase-6 | Server-state-aware Run Now button + live badge polling (mutation observer detached on navigation; now reads `aiRunLockUntil`). |
| `c69d625` | phase-6 | Restored Anthropic SDK default retries (`maxRetries: 0` had broken 429 handling). |
| `f7cc57f` | phase-6 | Raised AI per-call timeout to 180s; stopped retrying our own timeouts (`APIConnectionTimeoutError` is terminal). |
| `1bb561c` | phase-6 | Persist Run Now toasts 30s. New `scripts/inspect-ai-run.ts` for forensics. |
| `28b1ad3` | phase-6 | Reset AI toast hints "clear a field to re-run" when all fields are filled. |
| `a3cc6a9` | phase-6 | Photo strip no longer widens the lot detail dialog (`min-w-0` on grid child). |
| `6521489` | docs | Dev-notes accumulated gotchas + initial Phase 6 continuation handoff. |

## Open work

### Manual click-through pass (the user is doing this)

The user is working through the new E2E checklists (balanced version
in active use). Section A is largely checked off through A.6 as of last
push; user is continuing into A.7+. Section B (real Anthropic calls)
still pending. The user reports findings as they hit them; this
session's job is to investigate and fix what surfaces.

### Deferred to production cutover (do NOT run pre-prod)

These items live in [`prod-cutover-test-checklist.md`](prod-cutover-test-checklist.md):

- Cron preview observation (Vercel crons only run in prod)
- Stuck-lock self-heal (lock-only)
- Drain-in-progress flag exercise
- Cron continuation after Run Now leaves work pending
- Stuck-lock with real Anthropic 5xx
- Cron drain in prod preview
- Cleanup-orphan-lots cron
- AF360 export blob cleanup cron
- Physical Zebra ZD450 round-trip (Phase 7 deferral)
- Audit-log SQL spot-check on prod

The user explicitly chose to defer these rather than do curl-based
workarounds.

### After all manual sign-off completes

1. Add a Phase 6 section to [`STATE.md`](../../../STATE.md) mirroring
   the Phase 5 structure (status, sign-off bug fix batch, deviations,
   key memories).
2. Mark Phase 6 ✓ in [`docs/roadmap.md`](../../roadmap.md) — currently
   shows ⬜ (next).
3. Cut `phase-7-label-printing` off `phase-6-ai-subsystem` for the
   next phase.

## Recent UX/feature additions worth knowing about

These shipped this session and may surface in continued testing:

- **Search field** (Inventory, desktop + mobile) — title + description, debounced 300ms, URL-persisted via `?search=`.
- **Fill-gaps lot allocation** — POST /api/lots, single move, bulk move all use `nextLotNumberForJob` helper. Empty job → 10. Existing gaps fill before extending past max.
- **Compact lot numbers** — `POST /api/jobs/:id/compact-lots`, admin/office. Highest-into-lowest pairing, iterative. Sets `label_reprint_needed=true` on each moved lot.
- **Pre-export modal** — `ExportPrepDialog` opens when the operator clicks Export to AF360 from either Inventory or Customer detail. Shows readiness + gap status; offers Compact + Export with gaps when gaps exist.
- **Reprint pill** — yellow warning pill on lot rows when `label_reprint_needed=true`. Auto-clears when `/api/labels/render` fires for the lot. New filter chip "Reprint pending" on desktop and mobile.
- **`useLabelPrint` invalidation** — added in this session; reprint pill now clears in the inventory list after the operator clicks Reprint label, even when Browser Print fails.
- **PhotoManager layout fix** — uses `h-full` + scaled image; action bar reachable without scrolling inside the LotDetail Dialog.
- **Run Now toast persistence** — 30s on success/info, 60s on error.
- **Server-state-aware Run Now button** — reads `aiRunLockUntil`; stays disabled across navigation while a run is in flight; live polling of `system-settings` every 5s while the lock is held.

## Working with the user — what they expect

Distilled from auto-memory and prior sessions:

- **Verify before directing.** Read code or check `--help` — never guess at file paths, CLI flags, or UI layouts.
- **Pre-push trio is non-negotiable.** Lint warnings = failures (0/0).
- **Mobile parity.** UI fixes need to consider parallel mobile components: `InventoryFilters` + `InventoryFiltersMobileSheet`, `InventoryTable` + `InventoryMobile`. Catalog and lot detail use shared components, so one fix covers both.
- **No deferred quality issues.** Address before push.
- **Substantive feedback often via file** — offer markdown over long chat replies for non-trivial input.
- **Spec is a snapshot, not a constraint.** Propose better approaches; flag drift.
- **Phase work on `phase-6-ai-subsystem` branch.** Never push `main` until v1 cutover.
- **Inline questions, not picker.** List numbered Q1/Q2 at the end of a response — don't use `AskUserQuestion` unless the user explicitly asks for a picker.
- **Auto mode toggles.** May be on or off at any point. When off, ask before code changes that affect shared state. When on, proceed.
- **`docs/user-guide/` is gitignored.** The directory still exists locally; the user authors content there. Don't try to commit it.

## Don't

- Don't push to `main`.
- Don't run `drizzle-kit push --force` (denied by user policy).
- Don't curl-simulate cron when the user has explicitly deferred those items to prod.
- Don't dismiss test cascades as "flaky" — see dev-notes; the listener-leak fix should hold, but if cascades reappear, investigate (don't just re-run).
- Don't fabricate file paths or commit hashes — verify with `git log`, `Glob`, or `Grep` first.
- Don't skip reading `dev-notes.md` if your work touches one of its flagged areas.
- Don't commit `docs/user-guide/` content — it's intentionally untracked.

## Active diagnostic scripts

- [`scripts/inspect-ai-run.ts`](../../../scripts/inspect-ai-run.ts) — AI run forensics. Reads `system_settings` snapshot, the 10 most-recently-touched AI lots, and the audit-log timeline. Useful when the operator reports unexpected AI-run behavior.
