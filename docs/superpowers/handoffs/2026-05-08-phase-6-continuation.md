# Phase 6 — continuation handoff for the next session

> Created 2026-05-08. The previous session ran low on context mid
> testing pass. This doc is the deterministic re-entry point for the
> next session.
>
> The user is mid-test on the deployed preview; this session is
> reactive — listen for findings, propose fixes, push, repeat.
> No major new feature work is queued.

## How to use this doc

Open the next session with:

> **"read `docs/superpowers/handoffs/2026-05-08-phase-6-continuation.md`, then I'll continue with testing findings."**

Before any code change, read [`docs/dev-notes.md`](../../dev-notes.md) — it
captures gotchas the previous sessions hit (Zod 3/4 SDK mismatch, mobile
filter parallel components, eligibility-definition consistency across three
surfaces, etc.). The project-level [`CLAUDE.md`](../../../CLAUDE.md) also
points there.

## Branch state

- **Branch:** `phase-6-ai-subsystem` at HEAD `e020069` — all pre-push
  trio commits green, **pushed to GitHub**, Vercel preview should be
  rebuilding or live.
- **`ANTHROPIC_API_KEY`:** set in Vercel (production + preview scopes).
- **Migrations applied to Dev + Test:** through `0013` (drain-in-progress).
- **Pre-push trio at last push:** build clean (~6s), lint 0/0,
  **539/539 tests** (started Phase 6 sign-off at 449).
- **STATE.md:** still reflects Phase 5 sign-off; Phase 6 section gets
  added once manual click-through is complete.

## Authoritative documents

- **Original Phase 6 sign-off handoff (entry doc, may be partly stale):**
  [`docs/superpowers/handoffs/2026-05-06-phase-6-signoff.md`](2026-05-06-phase-6-signoff.md).
  Read this for full Phase 6 context if needed; the §"What shipped" and
  §"§6 acceptance gate" sections are still accurate; the rest reflects
  2026-05-06 state and may have moved on.
- **Spec:** [`docs/superpowers/specs/2026-05-06-phase-6-design.md`](../specs/2026-05-06-phase-6-design.md).
  Multiple amendment blocks added during this session (each dated). The
  code is authoritative when the spec disagrees.
- **End-to-end test checklists** (Phases 1–6, no cron):
  - Balanced (~2-3 hr): [`2026-05-08-e2e-balanced.md`](2026-05-08-e2e-balanced.md)
  - Exhaustive (~half-day): [`2026-05-08-e2e-exhaustive.md`](2026-05-08-e2e-exhaustive.md)
  These replaced the original Phase 6 sign-off checklist (2026-05-06)
  on 2026-05-08 once Phase 6 manual sign-off was effectively complete and
  the user wanted full E2E coverage before Phase 7. Cron-fired tests are
  deferred to [`prod-cutover-test-checklist.md`](prod-cutover-test-checklist.md).
- **AI prompt review:** [`docs/superpowers/handoffs/2026-05-08-ai-prompt-review.md`](2026-05-08-ai-prompt-review.md).
  Full assembled system prompt + call shape + roadmap items 2 (context)
  and 3 (training/improvement). Prompts have been revised this session
  per the operator's five principles.
- **Roadmap:** [`docs/roadmap.md`](../../roadmap.md). New "AI improvement
  track" section under Beyond v1.
- **Dev notes (READ THIS):** [`docs/dev-notes.md`](../../dev-notes.md).

## What shipped this session (commits since the original Phase 6 sign-off handoff)

In rough chronological order, condensed. See `git log` on the branch for
exact messages.

| Area | Highlights |
|---|---|
| REQ-3 (caching) | Ephemeral prompt caching wired; `computeCostCents` extended for cache rates; probe-ai shows `cache_read=`/`cache_write=` per call. |
| REQ-2 (badge) | `aiPendingLotCount` on `GET /api/system-settings`, mirrored on PATCH (so the badge doesn't read "undefined" after Save). Settings panel renders the count. |
| REQ-1 (filter split) | Single "Needs Info." chip → independent `awaitingAi` + `needsReview` chips on both desktop AND mobile (mobile sheet was a follow-up). Empty-fields rule: status NULL + all 3 fields populated → in NEITHER chip. |
| Schedule-gate fix | Cron handler now uses `mostRecentScheduledTime(now, timeOfDay, intervalHours)` grid + `aiDrainInProgress` flag (migration `0013`). The previous last-run-anchored heuristic is gone. |
| Test gaps | composeTitle double-space, audit attribution split (cron NULL vs operator id), Run Now lock-held. |
| AF360 export gate | Strict mode (option A): `JobDTO` gains `totalLotCount` and `exportReadyLotCount`; button enables only when every lot is `assigned` AND has title + description + price. Same gate now also applied to the customer's job list (`GET /api/jobs` extended with the counts via single LEFT JOIN). |
| AI overwrite gap | Skip-if-complete in cron eligibility + status-aware finalize. Lots with all 3 fields filled stay out of the queue; AI re-runs preserve operator-entered fields. |
| Filter reset on lot click | `InventoryTable.tsx` Link replaced with button so URL filter params survive lot detail navigation. |
| Run AI button | Disabled with tooltip when title + description + price are all populated. |
| Photo strip | Fixed-size 80px thumbnails + horizontal scroll + chevron arrows when overflowing (replaces the shrinking `flex-1` layout). |
| Cover thumbnail in lot detail header | Was rendering an empty styled div with no image source; now renders the actual `<img>` from `photos.data[0].signedUrl`. |
| Catalog filetype validation | Pre-`captureFirst` rejection of non-JPG/PNG so a webp upload doesn't create an orphan lot + stuck queue entry. |
| Catalog savedCount | Setter was missing (`const [savedCount] = useState(0)`); EndSessionConfirm now reports the accurate count. |
| Pending uploads UI | Failed pill is now clickable; popover lists each terminal-failure entry with Retry / Discard. Discard also DELETEs the orphan `lot_photo` row server-side. |
| AI prompt rewrite | Best-effort over null; `brief_description` and `description_body` always populated; explicit "NEVER fabricate" rule; operator-fields glossary added; marketing language banned. |
| **Reset AI** | New `POST /api/lots/[id]/ai-reset` + `'reset-ai'` bulk action. Single-lot button in `LotDetail`; bulk button in `BulkActionBar`. Refuses with 409/`LOT_AI_IN_PROGRESS` when a fresh per-lot lock is held. The original "no re-runs" rule is now relaxed to "no automatic re-runs" — explicit operator action allowed. |
| **Zod 4 SDK fix** | `import { z } from 'zod/v4'` in `anthropic.ts` so the SDK helper's `z.toJSONSchema()` actually works at runtime. Was causing every AI run to fail immediately with `"Cannot read properties of undefined reading 'def'"`. |
| **`tsconfig.json`** | Dropped deprecated `baseUrl`. |

## Open work

### Manual click-through pass (the user is doing this)

The user is working through the new E2E checklists (see Authoritative
documents above). Section A items (no AI execution) and Section B items
(real AI) are in scope. The user reports findings as they hit them; this
session's job is to investigate and fix what surfaces.

### Deferred to production cutover (do NOT run pre-prod)

These items I'm tracking for the user's prod-cutover test pass. They
involve simulated state via SQL or require Vercel cron firing on prod:

- A.7 — Cron preview observation (Vercel crons only run in prod)
- A.8 — Stuck-lock self-heal (lock-only)
- A.9 — Drain-in-progress flag exercise
- B.5 (second half) — cron continuation after Run Now leaves work pending
- B.6 — Stuck-lock with real Anthropic 5xx
- B.7 — Cron drain in prod preview

The user explicitly chose to defer these rather than do curl-based
workarounds. When Phase 8 cutover is reached, build a dedicated
`prod-cutover-test-checklist.md` with these items reframed for live
prod testing.

A.6 (lot detail PATCH lock guard via SQL) was completed earlier in this
session — do NOT add it to the prod cutover list.

### After all manual sign-off completes

1. Add a Phase 6 section to [`STATE.md`](../../../STATE.md) mirroring the
   Phase 5 structure (status, sign-off bug fix batch if any, deviations,
   key memories).
2. Mark Phase 6 ✓ in [`docs/roadmap.md`](../../roadmap.md) — currently
   shows ⬜ (next).
3. Cut `phase-7-label-printing` off `phase-6-ai-subsystem` for the next
   phase.

## Working with the user — what they expect

Distilled from prior sessions and their auto-memory:

- **Verify before directing.** Don't guess at file paths, CLI flags, or
  UI layouts. Read the relevant code or check `--help`.
- **Pre-push trio is non-negotiable.** Lint warnings = failures.
- **Mobile parity.** Whenever fixing or extending UI, check whether the
  same surface has a parallel mobile component. Inventory has parallel
  `InventoryFilters` + `InventoryFiltersMobileSheet`, `InventoryTable` +
  `InventoryMobile`. (Catalog and lot detail use shared components, so
  one fix covers both.)
- **No deferred quality issues.** Fix lint and type warnings before
  push, even if they look benign.
- **Substantive feedback often via file.** When asking for non-trivial
  input, offer to write a markdown file the user can edit rather than
  expecting a long chat reply.
- **Spec is a snapshot, not a constraint.** Propose better approaches
  when they emerge; flag drift but don't let the spec block
  improvements.
- **Phase work on `phase-6-ai-subsystem` branch.** Never push `main`
  until v1 cutover.
- **Author email:** repo-local git config is `Vantheos <ops@vantheos.com>`.
  Wrong email → Vercel rejects.
- **Auto mode toggling.** Auto mode may be on or off at any point. When
  off, ask before code changes that affect shared state. When on,
  proceed.

## Current todo list

```
1. [pending] Manual sign-off: cron logs (PROD), probe:ai 30 lots, click-through, stuck-lock self-heal (PROD)
2. [completed] Reset AI server: POST /api/lots/[id]/ai-reset + 'reset-ai' bulk action
3. [completed] Reset AI client: button in LotDetail + entry in inventory bulk action bar
4. [completed] Reset AI tests: server happy paths + role gating + client visibility + bulk dialog
```

Item 1 is the user's continued manual testing. Items 2–4 closed during
this session.

## Key memories the next session should know about

The user's `~/.claude/projects/d--Dev-auction-os/memory/MEMORY.md` is
loaded automatically. A few highlights especially relevant for the
remaining testing pass:

- `feedback_phase_signoff_clean_state.md` — phase sign-off requires
  clean state, no undiscussed items.
- `feedback_no_deferred_quality_issues.md` — applicable through the
  rest of the click-through.
- `feedback_pre_push_checks.md` — pre-push trio (build + lint + test)
  green before any push that triggers a Vercel deploy.
- `feedback_let_vercel_manage_deploys.md` — never run `vercel deploy`;
  push to GitHub instead.
- `feedback_branch_strategy.md` — phase work on `phase-N-<slug>`
  branches; `main` reserved for v1 cutover.
- `feedback_validate_before_commands.md` — pre-flight env checks
  (esp. `ANTHROPIC_API_KEY`, `CRON_SECRET`) before running commands
  that depend on them.

## Don't

- Don't push to `main`.
- Don't run `drizzle-kit push --force` (denied by user policy).
- Don't curl-simulate cron when the user has explicitly deferred those
  items to prod.
- Don't fabricate file paths or commit hashes — verify with `git log`,
  `find`, or `grep` first.
- Don't skip reading `dev-notes.md` if your work touches one of its
  flagged areas.
