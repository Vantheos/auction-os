# Production Cutover Test Checklist

> Living doc — populated whenever a test gets deferred from preview/dev
> testing because it requires production environment behavior. Run before
> Phase 8 (v1 cutover) sign-off.
>
> **Scope:** items that genuinely cannot be tested on a Vercel preview
> deployment. Most commonly: cron-fired schedules (Vercel only fires
> `crons` on production). Curl-simulating crons with `CRON_SECRET` is
> avoided here per user policy — these tests go on real prod.

## How to use

After Phase 8 cutover completes (per [`STATE.md`](../../../STATE.md)
"Phase 8 — v1 cutover checklist"), the production environment is live.
Before opening the app to real users, run through this list against the
production deployment. Each item references the original phase that
deferred it.

If any item fails, capture the symptom and stop — the cutover is reversible
only by promoting a previous deploy.

---

## Section P1 — AI subsystem cron (deferred from Phase 6)

### P1.1 Cron preview observation — schedule gate evaluates correctly
> Was Phase 6 A.7. Vercel cron only fires on production.

- [ ] In Vercel logs for the production deployment, find the most recent `*/15 * * * *` cron tick at `/api/ai/backlog?source=cron`.
- [ ] Response should be a 200 with one of:
  - `{ skipped: true, reason: 'disabled' }` (if `aiScheduleEnabled = false`)
  - `{ skipped: true, reason: 'too_soon' }` (no scheduled grid time has passed since last drain)
  - `{ skipped: true, reason: 'in_progress' }` (system lock held — rare during quiet periods)
  - `{ processed: 0, remaining: 0, ... }` (a grid time passed but no eligible lots)
- [ ] On a no-op `processed: 0, remaining: 0` outcome, verify in Supabase that `ai_last_run_at` was bumped to the recent past and `ai_drain_in_progress = false`.
- [ ] Repeated `skipped: too_soon`: verify `ai_schedule_time_of_day` + `ai_schedule_interval_hours` configuration; the next grid tick may legitimately be hours away.

### P1.2 Stuck-lock self-heal (lock-only, no AI)
> Was Phase 6 A.8.

- [ ] Pick a lot. `UPDATE lot SET ai_processing_started_at = NOW() - INTERVAL '6 minutes' WHERE id = '<id>';`
- [ ] Wait for the next cron heartbeat (or trigger Run Now manually).
- [ ] The lot is re-claimed by the staleness check; `ai_processing_started_at` becomes a fresh timestamp.
- [ ] Confirm via `SELECT id, ai_processing_started_at FROM lot WHERE id = '<id>';` immediately after the run.
- [ ] After the run completes, `ai_processing_started_at` clears to NULL.

### P1.3 Drain-in-progress flag exercise (no AI)
> Was Phase 6 A.9. Tests the cron's bypass of the schedule grid when a
> Run Now drain left work pending.

- [ ] `UPDATE system_settings SET ai_drain_in_progress = true, ai_last_run_at = NOW() WHERE id = 1;` — simulates a Run Now drain that left work pending while we're "throttled" by the grid.
- [ ] Wait for the next cron heartbeat.
- [ ] Even though `ai_last_run_at` is recent (would normally skip with `too_soon`), the heartbeat should **proceed** because `ai_drain_in_progress = true`.
- [ ] Find an eligible lot and confirm a drain occurred (or that an empty-queue tick still ran and cleared the flag).
- [ ] Cleanup confirmation: `ai_drain_in_progress = false` after the drain completes.

### P1.4 Cron continuation after Run Now leaves work pending
> Was Phase 6 B.5 (second half).

- [ ] Verify `aiPendingLotCount ≥ 25` (or whatever exceeds `CAP_PER_INVOCATION = 20`).
- [ ] Click **Run Now** in Settings. Toast reads `Processed 20 lots. M remaining ...`.
- [ ] Confirm in Supabase: `system_settings.ai_drain_in_progress = true` immediately after the toast.
- [ ] Wait for the next 15-min Vercel cron tick.
- [ ] The cron heartbeat continues the drain regardless of the schedule grid (because `ai_drain_in_progress` is true). Subsequent ticks should bring `remaining` to 0.
- [ ] After the final tick, `ai_drain_in_progress` flips back to false and `ai_last_run_at` is fresh.

### P1.5 Stuck-lock with real Anthropic 5xx
> Was Phase 6 B.6.

- [ ] Temporarily edit `scripts/probe-ai.ts` to throw a fake error AFTER `runAiForLot` returns but BEFORE the DB write — or use the existing `--write` path with the real API and pull the network mid-call.
- [ ] Run the modified probe against 1 lot. The script errors out. The lot's `ai_processing_started_at` is set but no finalize happened.
- [ ] Wait 5 minutes (or set `ai_processing_started_at` to 6 minutes ago).
- [ ] Wait for the next cron tick. The lot is re-claimed and processed cleanly.
- [ ] Revert your probe-ai edits before continuing.

### P1.6 Cron drain in production
> Was Phase 6 B.7.

- [ ] Have ≥1 awaiting-AI lot present.
- [ ] Wait until the next scheduled grid time arrives (per `ai_schedule_time_of_day` + `ai_schedule_interval_hours`).
- [ ] At the next 15-min cron heartbeat after the grid time, the cron drains. Vercel logs show 200 with `processed: N, remaining: 0` (or remaining > 0 if ≥`CAP_PER_INVOCATION`).
- [ ] `ai_last_run_at` updated; `ai_drain_in_progress = false` after drain.

---

## Section P2 — Cleanup crons

### P2.1 Orphan-lot cleanup cron
> Phase 3 surface. Vercel only fires the `*/15 * * * *` cron on prod.

- [ ] Find an orphan lot in Dev/Test data via SQL: `SELECT id, intake_timestamp, state FROM lot WHERE state IN ('assigned', 'unassigned') AND id NOT IN (SELECT lot_id FROM lot_photo) AND intake_timestamp < NOW() - INTERVAL '30 minutes';`
- [ ] On prod, confirm cleanup-orphan-lots cron fires every 15 min. Most ticks: deleted=0. After an orphan is older than 30 min, the next tick should reap it.

### P2.2 AF360 export blob cleanup cron
> Phase 5 surface. Schedule: `0 4 * * *` (daily at 04:00 UTC).

- [ ] Run an AF360 export to populate the Blob store with at least one zip.
- [ ] Wait > 24 hours for the next 04:00 UTC cron tick.
- [ ] Verify the old zip is removed from the Blob store; a fresh zip (< 24h old) is preserved.
- [ ] Vercel logs show the cron's deleted count.

---

## Section P3 — Phase 7 / Phase 8 deferrals (placeholder)

### P3.1 Physical Zebra ZD450 round-trip
> Phase 7 deferral (T-G1 from Phase 3 carry-forward).

- [ ] With a physical Zebra ZP450 connected via USB and Browser Print running on the workstation:
- [ ] Click Reprint label on a lot. Helper relays ZPL to the printer. Label prints.
- [ ] Verify label content matches `api/_lib/label-render.ts`: lot number (large), customer name (truncated to 20 chars), job tail (last segment after final `-`, truncated to 12 chars), and QR code linking to `{deployHost}/lot/{lot.id}`.

### P3.2 Audit-log SQL spot-check on prod
> Phase 8 cutover step 4 (T-G2 from Phase 3 carry-forward).

- [ ] Open Supabase Dashboard → SQL Editor on Prod.
- [ ] Make a test edit (e.g., update a lot's title via the UI as a known user).
- [ ] Query: `SELECT changed_at, table_name, change_type, changed_by, changed_fields FROM audit_log WHERE table_name = 'lot' ORDER BY changed_at DESC LIMIT 5;`
- [ ] Verify: `changed_by` matches the user-id that performed the edit (not NULL — that's the cron pattern). `changed_fields` shape = `{ old: {...}, new: {...} }`.

---

## Notes

Add new items here as future phases defer tests to prod environment behavior. Keep the section / item references back to the original phase doc that deferred them.

-
-
