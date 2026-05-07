# Phase 6 — Manual sign-off checklist

> Created 2026-05-06. Companion to [`2026-05-06-phase-6-signoff.md`](2026-05-06-phase-6-signoff.md).
> Run against the deployed preview for branch `phase-6-ai-subsystem` (commit `fceb24f` or later).
> Mark each box as you go; carry-forwards / surprises go in the **Notes** section at the bottom.

## How to use

- **Section A** ("UI + plumbing — no AI executions") covers everything that can be exercised without spending Anthropic API tokens. Run this first; no cost.
- **Section B** ("AI executions — real Anthropic calls") covers the gate items that require actual model calls. These cost money (≈ $0.03–$0.07 per lot at Sonnet 4.6). Save until Section A is clean.

Each item lists what to do, where to do it, and what "pass" looks like. If something fails, stop, capture the symptom, and bring it back to chat — don't tick the box and move on.

---

## Section A — UI + plumbing (no AI executions)

### A.1 Settings → AI section structure
- [ ] Open **Settings**. The **AI** section appears with two sub-cards: **Schedule** and **Cost**.
- [ ] **Schedule** sub-card shows: enabled checkbox, interval dropdown (4 / 8 / 12 / 24 hr), time-of-day input, **N lots pending AI** badge, **Run Now** button, **Save changes** button.
- [ ] **Cost** sub-card shows: month-to-date dollar amount; "Average per lot" or "no data yet".

### A.2 Pending-AI badge (REQ-2) — read-only correctness
- [ ] On a fresh inventory, badge reads `0 lots pending AI`.
- [ ] Create a new lot in **Inventory** (any quantity, any state — assigned or unassigned). Reload Settings (or revisit). Badge increments by 1.
- [ ] Singular form: with exactly **1** pending lot, badge reads `1 lot pending AI` (not `1 lots`).
- [ ] Promote a pending lot to `sold` (or set its `lastAiRunStatus = 'success'` via probe later); badge decrements.

### A.3 Schedule controls — config-only behavior (no AI cost)
- [ ] Toggle **AI scheduled runs enabled** off → click **Save changes**. Toast confirms save. Reload — the toggle stays off.
- [ ] Change interval to a different value, change time-of-day, save. Reload — both round-trip correctly. (Time displays as `HH:MM`; server stores `HH:MM:SS`.)
- [ ] Restore enabled = true and your preferred schedule before continuing.

### A.4 Inventory filter chips (REQ-1) — non-AI plumbing
- [ ] Open **Inventory**. The filter row shows two new chips: **Awaiting AI** and **Needs review** — alongside the State chips. The legacy single "Needs Info." chip is gone.
- [ ] Click **Awaiting AI**. URL gains `?awaitingAi=true`. List narrows to lots with `lastAiRunStatus IS NULL` and state in (assigned, unassigned). Lot count updates.
- [ ] Click **Awaiting AI** again to clear. URL drops `awaitingAi`. List restores.
- [ ] Click **Needs review**. URL gains `?needsReview=true`. Should currently show 0 lots if no AI has run yet (correct — needs-review only catches lots whose AI ran-and-didn't-fully-succeed). After running probe in Section B, recheck.
- [ ] Activate **both** chips together. URL has both flags. List = union (everything needing attention). Active-filter badge in the page header counts both flags (filter count goes up by 2).
- [ ] **Clear filters** button resets both AI chips and any state chips. URL drops all flags.
- [ ] **Legacy URL still works:** paste `?needsInfo=true` directly into the address bar; the list filters as the union of both new chips. After your next interaction (e.g. clicking a chip), the URL writer drops `needsInfo` and writes the new flags. Bookmarked links remain functional.

### A.4b AF360 export button — assigned-lot gate (Phase 6 fix)
- [ ] Open **Inventory**, filter to a customer + a job that has lots **only in non-assigned states** (sold / picked-up / not-sellable). The **Export to AF360** button is **disabled**, with hover tooltip `No lots in assigned state for this job`.
- [ ] Switch to a job that has at least one assigned lot. Button becomes **enabled** and clickable.
- [ ] Move a lot's state from `assigned` → `sold` so the count drops to 0; reload the page (or the job DTO query refreshes). Button transitions to disabled.

### A.5 Lot detail — Run AI button visibility (no execution)
- [ ] Open a lot whose `lastAiRunStatus` is NULL and state is assigned/unassigned. The **Run AI** button is visible (admin/office roles only).
- [ ] Open a lot whose `lastAiRunStatus = 'success'`. The button is **hidden** (no re-runs allowed).
- [ ] Open a lot whose state is `sold` / `picked-up` / `not-sellable`. Button is **hidden**.
- [ ] As warehouse role: button is hidden on every lot.

### A.6 Lot detail — PATCH lock guard (UI side, no AI run)
> This exercises the 423 LOT_AI_IN_PROGRESS path without running real AI. Use a SQL console (Supabase Studio) or `psql` to set the lock manually.

- [ ] Pick a lot, run `UPDATE lot SET ai_processing_started_at = NOW() WHERE id = '<id>';`
- [ ] Reload that lot in the UI. The **AI generating** banner appears; field inputs are disabled.
- [ ] Try editing a non-state field (title, description, price, quantity, special-notes). The PATCH returns **423**. UI shows a toast / error gracefully.
- [ ] Try a **state change** (e.g., assigned → unassigned). It succeeds (state PATCHes are not lock-guarded by design).
- [ ] Wait 5 minutes (or set the timestamp 6 minutes ago). Banner clears within ~5s of the next refetch; inputs re-enable.
- [ ] Cleanup: `UPDATE lot SET ai_processing_started_at = NULL WHERE id = '<id>';`

### A.7 Cron preview — schedule gate evaluates without spending
- [ ] In Vercel logs for the preview deploy, find the most recent `*/15 * * * *` cron tick.
- [ ] Response should be a 200 with one of:
  - `{ skipped: true, reason: 'disabled' }` (if AI is off)
  - `{ skipped: true, reason: 'too_soon' }` (no scheduled grid time has passed since last drain)
  - `{ skipped: true, reason: 'in_progress' }` (system lock held — rare during quiet periods)
  - `{ processed: 0, remaining: 0, ... }` (a grid time passed but no eligible lots — the no-op-bumps-aiLastRunAt case)
- [ ] If you see the no-op `processed: 0, remaining: 0` outcome, verify in Supabase that `ai_last_run_at` was bumped to the recent past and `ai_drain_in_progress = false`.
- [ ] If you see `skipped: too_soon` repeatedly: check `ai_schedule_time_of_day` + `ai_schedule_interval_hours` — the next grid tick may be hours away.

### A.8 Stuck-lock self-heal (lock-only, no AI)
> Simulates a crashed run by setting `ai_processing_started_at` directly.

- [ ] `UPDATE lot SET ai_processing_started_at = NOW() - INTERVAL '6 minutes' WHERE id = '<id>';`
- [ ] Trigger Run Now (Settings) or wait for the next cron tick.
- [ ] The lot is re-claimed by the staleness check; `ai_processing_started_at` becomes a fresh timestamp.
- [ ] Confirm via `SELECT id, ai_processing_started_at FROM lot WHERE id = '<id>';` immediately after the run.
- [ ] After the run completes, `ai_processing_started_at` clears to NULL.

### A.9 Schedule-gate fix — drain-in-progress flag (no AI)
- [ ] Set `UPDATE system_settings SET ai_drain_in_progress = true, ai_last_run_at = NOW() WHERE id = 1;` — simulates a Run Now drain that left work pending while we're "throttled" by the grid.
- [ ] Wait for the next cron heartbeat (or set `ai_run_lock_until` clear and trigger manually).
- [ ] Even though `ai_last_run_at` is recent (would normally skip with `too_soon`), the heartbeat should **proceed** because `ai_drain_in_progress = true`. Find an eligible lot and confirm a drain occurred (or that an empty-queue tick still ran and cleared the flag).
- [ ] Cleanup: confirm `ai_drain_in_progress = false` after the drain completes.

---

## Section B — AI executions (real Anthropic calls)

> These items spend tokens. Have the Anthropic billing dashboard open in another tab so you can spot anomalies.

### B.1 Probe smoke test (≥5 lots, prompt-caching verification)
- [ ] Run `npm run probe:ai -- --lots 5` against Dev (`.env`).
- [ ] Each lot's per-call output line should look like: `status: ... (1234ms, 5000in/200out, ...c, NN¢)`.
- [ ] **First call** in the run: `cache_read=` is absent, `cache_write=NNNN` shows on the line (typically 1500–3000 tokens for our system prompt).
- [ ] **Second call onward** (within ~5 min): `cache_read=NNNN` appears with a non-zero count; the per-call cost is noticeably lower than the first call.
- [ ] Output review: titles ≤50 chars, descriptions are natural plain text (no bullets / newlines / markdown), prices are reasonable USD numbers.
- [ ] Total cost printed at the bottom matches your rough mental estimate (5 lots × ~$0.03 = ~$0.15).

### B.2 Probe sign-off batch (≥30 lots, quality review)
- [ ] Run `npm run probe:ai -- --lots 30 --write` against Dev. (The `--write` flag persists outputs back to the lot rows; this is the "real cataloging dry run" pass.)
- [ ] Spot-check at least 10 lots:
  - Title format: `$NNN- Qx Brand brief description` (with TOOL ONLY / READ suffix where applicable)
  - Description: single paragraph, plain text, mentions visible condition, no "tested/untested" speak (the app appends UNTESTED separately)
  - Price: a number, not implausibly off (e.g., a $5 wrench shouldn't get a $500 reference)
- [ ] Note any lot whose output is wrong or weird; capture the lot ID for prompt-tuning iteration.
- [ ] **Cost counters NOT bumped.** Confirm `system_settings.ai_cost_lifetime_cents` and `ai_run_count_lifetime` are unchanged after this probe (they should be — probe deliberately skips counters per the inline comment in `scripts/probe-ai.ts`).

### B.2b Operator-entry preservation (status-aware finalize)
> Verifies the Phase 6 fix: AI fills empty fields but preserves operator entries.

- [ ] Pick a lot with `lastAiRunStatus = NULL` and state assigned/unassigned. In the lot detail modal, manually enter a **title** and **save**. Leave description and price blank.
- [ ] Click **Run AI**. Wait for the run to complete.
- [ ] After the run: title is **unchanged** (still your manual entry); description and price are filled by AI; `lastAiRunStatus = 'success'`.
- [ ] Repeat with a second lot, this time entering only **price**. AI should fill title + description and leave price untouched.
- [ ] Repeat with a third lot, entering **all three** fields manually. The lot should NOT appear in the **Awaiting AI** filter chip nor in the pending-AI badge — it's no longer eligible (eligibility skip). Confirm the **Run Now** in Settings does not pick it up either; only the per-lot **Run AI** button on lot detail can still trigger AI for it (and even then, all three fields are preserved, so the AI call is wasted spend — flag this if the operator clicks it).

### B.3 Single-lot Run AI button
- [ ] In the preview, open a fresh eligible lot (status NULL, state assigned/unassigned) and click **Run AI**.
- [ ] Banner appears almost immediately ("AI generating content for this lot. Inputs are read-only until done.").
- [ ] Field inputs disable.
- [ ] Within ~30s the banner clears and the lot's title / description / price are populated.
- [ ] `lastAiRunStatus` shows the outcome (success / partial / failure). On partial/failure, an error message is visible.
- [ ] The cost counters in Settings → AI → Cost reflect the run (MTD increased, run count incremented).
- [ ] The pending-AI badge in Settings → AI → Schedule decrements by 1.

### B.4 Settings Run Now — full drain
> Pick a state where 3–5 lots are awaiting AI.

- [ ] Click **Run Now** in Settings → AI → Schedule.
- [ ] Button label flips to **Running…** and disables.
- [ ] On success, toast variant matches:
  - `processed > 0, remaining = 0` → "Processed N lots. Backlog cleared." (success toast)
  - `processed > 0, remaining > 0` → "Processed N lots. M remaining — click Run Now again or wait for the next scheduled run at HH:MM." (info toast)
  - `processed = 0, remaining = 0` → "No lots are pending AI processing." (info)
- [ ] Pending-AI badge updates after the toast.
- [ ] Cost counters update.
- [ ] Run **Run Now** twice in quick succession — second click should bounce with "AI run already in progress. Try again in a moment." (because the system lock is held by the first call).

### B.5 Settings Run Now — work remains, cron continues
> Best done on Dev with ≥25 awaiting-AI lots so the first Run Now hits the per-invocation cap.

- [ ] Verify `aiPendingLotCount ≥ 25` via the badge or a count query.
- [ ] Click **Run Now**. Toast reads `Processed 20 lots. M remaining ...`.
- [ ] Confirm in Supabase: `system_settings.ai_drain_in_progress = true` immediately after the toast.
- [ ] Wait for the next 15-min Vercel cron tick (or trigger manually if you have an interactive way).
- [ ] The cron heartbeat continues the drain regardless of the schedule grid (because drain-in-progress is true). Subsequent ticks should bring `remaining` to 0.
- [ ] After the final tick, `ai_drain_in_progress` flips back to false and `ai_last_run_at` is fresh.

### B.6 Stuck-lock self-heal — real Anthropic 5xx
> Confirms the per-lot lock unwinds correctly when an AI call dies mid-flight.

- [ ] Temporarily edit `scripts/probe-ai.ts` to throw a fake error AFTER `runAiForLot` returns but BEFORE the DB write — or use the existing `--write` path with the real API and pull the network mid-call (less surgical).
- [ ] Run the modified probe against 1 lot. The script errors out. The lot's `ai_processing_started_at` is set but no finalize happened.
- [ ] Wait 5 minutes (or set `ai_processing_started_at` to 6 minutes ago).
- [ ] Trigger Run Now or the next cron tick. The lot is re-claimed and processed cleanly.
- [ ] Revert your probe-ai edits before continuing.

### B.7 Cron drain in production preview
- [ ] Have ≥1 awaiting-AI lot present.
- [ ] Wait until the next scheduled grid time arrives (per `ai_schedule_time_of_day` + `ai_schedule_interval_hours`).
- [ ] At that next 15-min cron heartbeat after the grid time, the cron should drain. Vercel logs show 200 with `processed: N, remaining: 0` (or remaining > 0 if ≥20 lots).
- [ ] `ai_last_run_at` updated; `ai_drain_in_progress = false` after drain.

---

## Notes / carry-forwards

Capture anything surprising or anything you want to revisit before STATE.md gets the Phase 6 sign-off section:

-
-
-
