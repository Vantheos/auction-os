# Phase 6 sign-off — handoff for the next session

> Created 2026-05-06. The implementation conversation ran low on context;
> this doc is a deterministic re-entry point for the next session that
> drives manual sign-off + any cleanup the user wants before promoting
> Phase 6 forward.

## How to use this doc

Open the next session with: **"read `docs/superpowers/handoffs/2026-05-06-phase-6-signoff.md`, then I have comments and questions."**

The user has explicit follow-ups in §"User comments + answers" below. Don't launch into work — open by asking which of those they want to discuss / action first.

## State

- **Branch:** `phase-6-ai-subsystem` at HEAD `92a987b` — **pushed to GitHub**, 44 commits ahead of `phase-5-auction-platform-export`.
- **`ANTHROPIC_API_KEY`:** set in Vercel (production + preview scopes) — user confirmed 2026-05-06.
- **Preview deploy:** complete and green per user confirmation.
- **Pre-push trio:** build clean (~5.4s), lint 0/0, **449/449 tests pass**.
- **Migration `0012`:** applied to Dev + Test Supabase databases.
- **STATE.md:** still reflects Phase 5 sign-off (no Phase 6 section yet — that gets added once manual click-through is complete).

## Authoritative documents

- **Spec:** [`docs/superpowers/specs/2026-05-06-phase-6-design.md`](../specs/2026-05-06-phase-6-design.md). Authoritative for product decisions across all 8 areas (A–H).
- **Plan:** [`docs/superpowers/plans/2026-05-06-phase-6.md`](../plans/2026-05-06-phase-6.md). Step-by-step implementation that was executed.
- **v1 spec banner:** Added to `docs/superpowers/specs/2026-04-29-v1-design.md` flagging that current code + per-phase specs override the v1 wording, except for label printing (Phase 7 territory). v1 §9 (AI subsystem) is now superseded entirely by the Phase 6 spec.

## What shipped

44 commits across 8 phases (A–H) plus polish. Highlights by surface:

| Surface | Files |
|---|---|
| Schema | `supabase/migrations/0012_phase_6_ai_subsystem.sql` — adds `lot.ai_processing_started_at`, 5 cost/lock columns on `system_settings`, tightens `lot.quantity` to NOT NULL DEFAULT 1. |
| AI core libs | `src/lib/ai/{model,prompts,p-limit,compose,anthropic}.ts` |
| Server | `api/ai/run.ts`, `api/ai/backlog.ts`, plus shared `api/_lib/{ai-counters,ai-finalize,ai-thresholds}.ts`. PATCH lock check added to `api/lots/[id].ts`; `?needsInfo=true` GET filter added to `api/lots/index.ts`. |
| Client | `src/hooks/{useAiRun,useAiBacklog,useNow}.ts`. New components `LotAiButton`, `AiCostPanel`. Settings restructure (AI section with Schedule + Cost sub-cards + Run Now button). InventoryFilters "Needs Info." chip with URL passthrough. LotDetail wires the button + disables fields when AI is processing. |
| Cron + ops | `vercel.ts` 15-min cron entry; `scripts/probe-ai.ts` for real-API probing; `ANTHROPIC_API_KEY` in `.env.example` + `verify-env.ts` + `env-setup.ts`. |

Locked semantics:
- **Sonnet 4.6 only** (no model selector).
- **No re-runs** — AI runs exactly once per lot, with one transient-error retry inside the single run.
- **Drain-eagerly schedule** — operator's interval is the idle re-check cadence, not a throttle.
- **Vercel cron every 15 min** with per-invocation cap of **20 lots** at concurrency **3**.
- **Single-runner system lock** (5-min TTL) prevents multiple concurrent backlog drains.
- **Per-lot processing lock** (`ai_processing_started_at`, 5-min staleness window) blocks PATCH field edits during a run.
- **Cost tracking** as counters on `system_settings` (MTD + lifetime + run count), incremented on every API call.

## §6 acceptance gate (from the spec)

The user runs through this during sign-off:

1. Migration `0012` applied to Dev + Test → ✓ already done.
2. Vitest suite green (target ≥395) → ✓ 449 passing.
3. `ANTHROPIC_API_KEY` present in Vercel production + preview → ✓ user confirmed.
4. `vercel.ts` updated with the `*/15 * * * *` cron entry; first deployed cron tick observed in Vercel logs returning 200 with `{skipped: too_soon}` or `{processed: 0}`. **PENDING — verify via Vercel logs.**
5. Manual sign-off batch: `npm run probe:ai -- --lots 30` against ≥30 real lots in Dev with real Anthropic, output reviewed for quality (titles ≤50 chars, descriptions natural, prices reasonable). **PENDING.**
6. Manual sign-off click-through against the deployed preview:
   - a. Settings → AI section shows Schedule + Cost sub-cards correctly. **Schedule sub-card includes the "N lots pending AI" badge (REQ-2).**
   - b. Run Now button works, shows correct toast for `remaining=0` and `remaining>0`. **Pending-AI badge updates after a run.**
   - c. Lot detail "Run AI" button visible only on eligible lots; runs and updates lot in place.
   - d. Lot detail "AI generating" banner appears during in-flight run; field inputs disabled; banner clears within 5s of run completion.
   - e. PATCH on a lot with active in-flight returns 423; UI handles gracefully.
   - f. Inventory **two** filter chips ("Awaiting AI" + "Needs review", REQ-1) toggle independently; each result set matches its SQL semantics; both active = union.
   - g. Cost displays update after AI runs.
   - h. **Prompt caching active (REQ-3): probe a fresh lot, then probe a second lot within 5 min — second call's `usage.cache_read_input_tokens > 0`, observable via the probe script's per-call output.**
7. Cron trigger observed in production preview: at least one full eligible-backlog drain completing within reasonable wall time. **PENDING.**
8. No stuck-lock observed after deliberate Anthropic 5xx via probe with mock failure: `ai_processing_started_at` and `ai_run_lock_until` clear within 5 minutes. **PENDING (worth a deliberate test).**
9. Branch ready for promotion to next-phase parent (Phase 7); commits pushed → ✓.

## User comments + answers (carry into next session)

The user reviewed the final code-review summary and asked specific follow-ups. Answers below; bring these up unprompted at session start so they don't have to repeat.

### Minor item #3 (mock-anthropic comment clarity) — explained, not a bug
The helper's comment ("Convenience: invoke at top of a test file") reads like there's a separate install step. There isn't — calling `installAnthropicMock()` IS the install (the function does `vi.mock(...)` internally, which vitest hoists). Comment is slightly redundant but the code is correct. **Action: nothing required.** Could tighten the comment if it ever causes confusion.

### Minor item #4 (probe-ai skips counters) — explained
- `scripts/probe-ai.ts --write` updates the lot row's title/description/price/status but **does NOT** bump the `system_settings` cost counters (`ai_cost_mtd_cents`, `ai_cost_lifetime_cents`, `ai_run_count_lifetime`).
- **Production cost figures are correct.** Real `/api/ai/run` and `/api/ai/backlog` runs go through `finalizeLotRun` → `bumpAiCounters`, so they ARE counted in Settings → AI → Cost.
- Only dev-only probe runs are excluded. Intentional — you don't want prompt-tuning experiments inflating operational cost metrics — but the script doesn't have a comment saying so. Probe costs are visible in the Anthropic billing dashboard.
- **Action:** add a comment in `scripts/probe-ai.ts` explaining the deliberate skip (small fix, ~3 lines).

### Test coverage gaps — yes, testable; offer to add
The three flagged gaps are all testable with ~30 min of work:
1. **composeTitle double-space collapse** — pure-function unit test in `tests/lib/ai-compose-title.test.ts`. ~10 lines.
2. **Audit attribution split (Run Now writes operator_id, cron writes NULL changed_by)** — extend the existing endpoint tests with a SELECT-from-audit-log assertion. ~20 lines per endpoint.
3. **Run Now skips on held system lock** — copy the existing cron `in_progress` test in `tests/api/ai-backlog.test.ts`, swap to `callUser()`. ~15 lines.

These are "lock the contract" tests for refactor safety. They were flagged because the spec's explicit test list didn't enumerate them and the implementer followed the spec literally. The user's "no deferred quality issues" rule suggests adding them. **Action: ask the user if they want these added before sign-off (recommended) or carried forward.**

### REQUIRED Phase 6 additions — pulled forward from v1.5 per user direction (2026-05-06)

The user reviewed the v1.5 list and decided three items belong in Phase 6 itself, before sign-off. **Do these in the new session as the first work item.**

#### REQ-1: Split the "Needs Info." filter into two distinct chips

Replace the single boolean `Filters.needsInfo` chip + its combined SQL clause with two separately-toggleable chips matching the existing State-chip pattern:

| Chip | Filter (server) |
|---|---|
| **Awaiting AI** | `last_ai_run_status IS NULL AND state IN ('assigned', 'unassigned')` — eligible for AI but not yet processed. |
| **Needs review** | `last_ai_run_status IN ('partial', 'failure')` — AI ran but didn't fully succeed. |

Operator can toggle one or both; both active = everything needing attention.

**Open question for the new session to surface to the user:** the rare "AI succeeded then operator cleared a field" edge case. Either (a) leave outside both filters (recommended — it's a different conceptual state from "AI didn't succeed"), or (b) fold into "Needs review". The original combined filter caught (b).

**Files to touch:**
- `src/components/inventory/InventoryFilters.tsx` — replace single chip with two; update `Filters` type.
- `src/hooks/useInfiniteLots.ts` — query-string passthrough for both flags.
- `src/routes/Inventory.tsx` — `parseFiltersFromUrl` / `writeFiltersToUrl` / `activeFilterCount` updates for both flags.
- `api/lots/index.ts` — replace the single `?needsInfo=true` SQL clause with two separate query params (e.g. `?awaitingAi=true&needsReview=true`) and the corresponding SQL clauses.
- `tests/api/lots-needs-info.test.ts` — rename / restructure for the two-filter shape.
- `tests/client/components/InventoryFilters-needsinfo.test.tsx` — same.
- Spec: update §3.7 G.3 to document the split. Plan: add an entry to the deviations / amendments section if appropriate.

#### REQ-2: "N lots pending AI" badge

Add a small count badge to the Schedule sub-card in Settings → AI, near the Run Now button. Shows the current count of `last_ai_run_status IS NULL AND state IN ('assigned', 'unassigned')`.

**Implementation approach (recommended):** extend `GET /api/system-settings` to include `aiPendingLotCount: number` in its response. The Settings panel already reads `useSystemSettings()`, so the badge value falls out for free; the cost-counter cards already follow the same pattern. The count is computed via a small `SELECT COUNT(*) FROM lot WHERE ...` joined with the singleton fetch.

**Files to touch:**
- `api/system-settings.ts` — extend GET to compute + include the count.
- `shared/types.ts` — `SystemSettingsDTO` gains `aiPendingLotCount: number`.
- `src/routes/Settings.tsx` — render the badge in the Schedule sub-card.
- `tests/api/system-settings.test.ts` — extend.
- `tests/client/components/Settings.test.tsx` — extend for badge rendering.
- Spec: update §3.7 G.1 to document the badge. Plan: add a sub-task under Phase F.

#### REQ-3: Anthropic prompt caching

Mark the static system prompt portion (SCAFFOLD + TITLE_RULES + DESCRIPTION_RULES + PRICE_RULES) as ephemeral-cacheable. First call creates a cache; subsequent calls within ~5 min reuse it at ~10% of the input-token cost.

**Files to touch:**
- `src/lib/ai/anthropic.ts` — change the `system: <string>` argument shape to:
  ```ts
  system: [{
    type: 'text',
    text: SYSTEM_SCAFFOLD + '\n' + TITLE_RULES + '\n' + DESCRIPTION_RULES + '\n' + PRICE_RULES,
    cache_control: { type: 'ephemeral' },
  }]
  ```
- `src/lib/ai/model.ts` — extend `computeCostCents` to handle cache hits. Anthropic's `usage` object in the response includes `cache_creation_input_tokens` and `cache_read_input_tokens` alongside `input_tokens`. Cache reads are billed at ~10% of normal input rate. Add the rate constant (e.g., `cachedInputCentsPerMillion: 30` for Sonnet 4.6 — verify against current pricing) and update the formula to charge cache_read_input_tokens at the discounted rate.
- `tests/lib/ai-model.test.ts` — extend with a cache-hit case.
- Sanity-check via `npm run probe:ai -- --lots 5` — cache should activate from the second call onward; observe via the response's `usage.cache_read_input_tokens` field.
- Spec: update §3.2 to document caching. Plan: add a sub-task under Phase B (model.ts) or C (anthropic.ts).

### v1.5 carry-forwards (deferred per user direction)
- **Per-lot retry button** — defer.
- **Cost spike alert** — defer.
- **Run Now progress polling indicator** (X of Y processed in real-time during a Run Now click) — defer; the post-Run-Now toast already gives operator a count.

## Other carry-forwards (already in the project's tracking)

These came up during code reviews and aren't blockers; left here so the next session has them on the radar:

- The drain-eagerly tail in `api/ai/backlog.ts` uses `if (remaining === 0 && processed > 0)`, slightly stricter than the spec's "if `remaining = 0`". Effect: a no-op invocation doesn't bump `ai_last_run_at`, so the next 15-min tick re-runs the empty query. Cost: negligible (one DB roundtrip every 15 min). Either fix the spec text to document the divergence or drop the `&& processed > 0` guard. **Action: discuss preference; very low priority.**
- `/api/ai/run` returns HTTP 200 on the failure path (with `lastAiRunStatus: 'failure'` in the body), not 5xx. Correct behavior — the hook switches on the status field — but the spec doesn't explicitly call this out. **Action: no code change; consider a one-line clarification in the spec.**
- `tryExtractUsageFromError` is wired but no test currently exercises a thrown error with `.usage` — locks the contract for future SDK upgrades. Could pair with the test gaps above.

## Suggested next steps for the new session

The three REQ items above are the first work to do; sign-off can't complete until they ship. Recommended order:

1. **Open by confirming approach:** "I see three required Phase 6 additions in the handoff (filter split, pending badge, prompt caching) plus the test gaps and the probe-ai comment. Recommend tackling REQ-1/2/3 first, then the test gaps, then probe-ai comment, then manual sign-off. Approve or reorder?" — let the user direct.
2. **REQ-3 first** (smallest, lowest risk): prompt caching in `src/lib/ai/anthropic.ts` + model rate constant + test extension. ~30–45 min. Verify via `probe:ai`.
3. **REQ-2 next:** `aiPendingLotCount` in system-settings response + Settings sub-card badge + tests. ~1 hour.
4. **REQ-1 last** (most surface area): filter split. ~2–3 hours touching 6 files + 2 tests + spec/plan updates.
5. **After REQs:** the three test gaps (composeTitle double-space collapse, audit attribution split, Run Now lock-held). ~30 min.
6. **Then Minor #4:** add the comment to `scripts/probe-ai.ts` explaining the deliberate counter skip. ~5 min.
7. **Pre-push trio + push** after each REQ to keep the branch always-shippable.
8. **Manual sign-off:**
   - Verify Vercel cron logs (gate item 4).
   - Run `npm run probe:ai -- --lots 30` and review output (gate item 5).
   - Manual click-through on the preview deploy (gate item 6 a–g) — make sure to exercise both new filter chips and verify the badge updates after Run Now clears the queue.
   - Check stuck-lock self-heal (gate item 8).
9. **After sign-off completes:** add a Phase 6 section to STATE.md mirroring the Phase 5 structure (status table, sign-off bug fix batch if any, deviations captured during execution, key memories), bump `roadmap.md` to mark Phase 6 ✓, and cut `phase-7-label-printing` off `phase-6-ai-subsystem` for the next phase.

Each REQ also bumps the spec + plan accordingly (the spec is supposed to mirror the actual implementation; document the additions there as deviations/amendments rather than rewriting top-down).

## Key memories to re-read at session start

The user's `~/.claude/projects/d--Dev-auction-os/memory/MEMORY.md` index lists all of them. The most relevant for Phase 6 sign-off + post-sign-off cleanup work:

- `feedback_phase_signoff_clean_state.md` — phase sign-off requires clean state, no undiscussed items.
- `feedback_no_deferred_quality_issues.md` — applicable to whether the test gaps get added now.
- `feedback_pre_push_checks.md` — pre-push trio (build + lint + test) green before any push that triggers a Vercel deploy.
- `feedback_let_vercel_manage_deploys.md` — never run `vercel deploy`; push to GitHub instead.
- `feedback_branch_strategy.md` — phase work on `phase-N-<slug>` branches; `main` reserved for v1 cutover.
- `feedback_validate_before_commands.md` — pre-flight env check before running commands (esp. ANTHROPIC_API_KEY presence).

## Don't forget

- **STATE.md update**: required after sign-off — Phase 6 section parallel to Phases 3, 4, 5 sign-off sections.
- **roadmap.md update**: mark Phase 6 ✓ in the v1 — completed table; update Phase 7 (Label printing) outline as next.
- **Phase 7 branch**: when Phase 6 is fully signed off, cut `phase-7-label-printing` off `phase-6-ai-subsystem`.
