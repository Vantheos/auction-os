-- 0013_phase_6_drain_in_progress.sql
-- REQ — Schedule-gate fix (2026-05-06)
--
-- Adds `system_settings.ai_drain_in_progress` so the cron heartbeat can
-- distinguish "we drained the queue and are waiting for the next scheduled
-- time" from "a drain cycle is open and should keep processing every tick
-- until the queue is empty."
--
-- Background: the previous schedule gate compared NOW vs aiLastRunAt +
-- intervalHours. That conflated three states (idle / mid-drain / throttled)
-- and used last-run-anchored timing instead of the operator's time-of-day
-- grid. The new gate (api/ai/backlog.ts) uses a regular grid derived from
-- ai_schedule_time_of_day + ai_schedule_interval_hours and keys on the
-- explicit drain-in-progress flag. This column is set when a drain cycle
-- begins (either cron-triggered at a scheduled time, or operator-triggered
-- via Run Now) and cleared when the queue is fully drained (remaining = 0).

ALTER TABLE system_settings
  ADD COLUMN ai_drain_in_progress boolean NOT NULL DEFAULT false;
