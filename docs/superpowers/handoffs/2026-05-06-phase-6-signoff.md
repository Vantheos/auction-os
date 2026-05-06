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
   - a. Settings → AI section shows Schedule + Cost sub-cards correctly.
   - b. Run Now button works, shows correct toast for `remaining=0` and `remaining>0`.
   - c. Lot detail "Run AI" button visible only on eligible lots; runs and updates lot in place.
   - d. Lot detail "AI generating" banner appears during in-flight run; field inputs disabled; banner clears within 5s of run completion.
   - e. PATCH on a lot with active in-flight returns 423; UI handles gracefully.
   - f. Inventory "Needs Info." filter chip toggles correctly; results match the SQL semantics.
   - g. Cost displays update after AI runs.
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

### v1.5 — Progress UI (defer with detail)
**How operators see queue state today:**
- After Run Now click: toast with "Processed N lots. M remaining."
- Otherwise: nothing persistent. No "N lots awaiting AI" badge, no progress bar during a run, no inventory count of eligible lots.
- Indirect: the "Needs Info." filter surfaces lots needing attention but mixes "not yet AI'd" with "AI ran but partial/failure".

**v1.5 enhancement scope:** small "N lots pending AI" badge on the Schedule sub-card next to Run Now, plus optionally a progress polling indicator during Run Now. Carried forward — defer.

### v1.5 — Prompt caching (defer with detail)
Anthropic's prompt caching lets you mark portions of the system prompt as `cache_control: { type: 'ephemeral' }`. First call creates a cache; subsequent calls within ~5 min reuse it for ~10% of the input-token cost.

For Phase 6: the system scaffold + TITLE_RULES + DESCRIPTION_RULES + PRICE_RULES is identical across every call → mark as cacheable. Per-lot photos + operator fields are unique → not cacheable.

Implementation is ~5 lines in `src/lib/ai/anthropic.ts`: change the `system: <string>` argument to `system: [{ type: 'text', text: <string>, cache_control: { type: 'ephemeral' } }]`. At our scale (~1000 lots/month), this likely cuts ~30–50% off the input-token cost. Currently projecting ~$65/month → savings of $20–30/month. Not huge, but free. Carried forward — defer.

### v1.5 carry-forwards (deferred per user direction)
- **Per-lot retry button** — defer.
- **Cost spike alert** — defer.
- **Progress UI** (above) — defer with the detail noted.
- **Prompt caching** (above) — defer with the detail noted.

## Other carry-forwards (already in the project's tracking)

These came up during code reviews and aren't blockers; left here so the next session has them on the radar:

- The drain-eagerly tail in `api/ai/backlog.ts` uses `if (remaining === 0 && processed > 0)`, slightly stricter than the spec's "if `remaining = 0`". Effect: a no-op invocation doesn't bump `ai_last_run_at`, so the next 15-min tick re-runs the empty query. Cost: negligible (one DB roundtrip every 15 min). Either fix the spec text to document the divergence or drop the `&& processed > 0` guard. **Action: discuss preference; very low priority.**
- `/api/ai/run` returns HTTP 200 on the failure path (with `lastAiRunStatus: 'failure'` in the body), not 5xx. Correct behavior — the hook switches on the status field — but the spec doesn't explicitly call this out. **Action: no code change; consider a one-line clarification in the spec.**
- `tryExtractUsageFromError` is wired but no test currently exercises a thrown error with `.usage` — locks the contract for future SDK upgrades. Could pair with the test gaps above.

## Suggested next steps for the new session

In the order I'd recommend:

1. **Open by asking:** "Which of the user comments / questions in this handoff would you like to address first?" — let them pick.
2. **If "test gaps" is in scope:** add the three small tests in one batch. ~30 min.
3. **If Minor #4 is in scope:** add the comment to `scripts/probe-ai.ts` explaining the deliberate counter skip.
4. **Otherwise:** move directly to manual sign-off:
   - Verify Vercel cron logs (gate item 4).
   - Run `npm run probe:ai -- --lots 30` and review output (gate item 5).
   - Manual click-through on the preview deploy (gate item 6 a–g).
   - Check stuck-lock self-heal works as expected (gate item 8).
5. **After sign-off completes:** add a Phase 6 section to STATE.md mirroring the Phase 5 structure (status table, sign-off bug fix batch if any, deviations captured during execution, key memories), bump `roadmap.md`, and decide whether the v1.5 carry-forwards should be a separate `phase-6.5-polish` branch or fold into Phase 7.

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
