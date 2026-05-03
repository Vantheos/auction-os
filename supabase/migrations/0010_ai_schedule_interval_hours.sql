-- Phase 4 — Area 3: replace ai_schedule_frequency enum with an integer
-- column.
--
-- Reasoning (per spec §3.3 + planning round): hourly batching has marginal
-- cost benefit over real-time AI generation, so the (hourly, daily) enum
-- doesn't reflect the actual operational shape — admin wants intervals like
-- 4 / 8 / 12 / 24 hours to balance batch cost vs lot turnaround. Integer
-- hours keeps the schema flexible for future tweaks without further
-- migrations (any new interval is just a UI option, no DB change).
--
-- v1 has not shipped to Prod; destructive migration is safe.

ALTER TABLE system_settings
  ADD COLUMN ai_schedule_interval_hours integer NOT NULL DEFAULT 24;

ALTER TABLE system_settings
  DROP COLUMN ai_schedule_frequency;

DROP TYPE ai_schedule_frequency;
