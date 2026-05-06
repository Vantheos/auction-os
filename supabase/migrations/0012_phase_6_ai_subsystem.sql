-- Phase 6 — AI subsystem schema additions.
-- Per docs/superpowers/specs/2026-05-06-phase-6-design.md §3.1.

-- ────────────────────────────────────────────────────────────────────
-- LOT additions
-- ────────────────────────────────────────────────────────────────────

-- Per-lot processing lock for AI runs. Set to NOW() when the AI runner
-- starts on this lot; set back to NULL on completion. Rows older than
-- 5 minutes are treated as stale (crash recovery via the eligibility
-- query in api/ai/backlog.ts and api/ai/run.ts).
ALTER TABLE lot
  ADD COLUMN ai_processing_started_at timestamptz;

-- Tighten quantity: app layer (api/lots POST + cataloging UI) already
-- defaults to 1 since Phase 1, but the schema has been nullable.
-- Backfill any historical nulls (defensive — should be 0 rows in Dev
-- or Prod) and enforce at the DB layer so future import paths can't
-- bypass the contract.
UPDATE lot SET quantity = 1 WHERE quantity IS NULL;
ALTER TABLE lot
  ALTER COLUMN quantity SET DEFAULT 1,
  ALTER COLUMN quantity SET NOT NULL;

-- ────────────────────────────────────────────────────────────────────
-- SYSTEM_SETTINGS additions — cost counters + system-level run lock
-- ────────────────────────────────────────────────────────────────────

ALTER TABLE system_settings
  ADD COLUMN ai_cost_mtd_cents integer NOT NULL DEFAULT 0,
  ADD COLUMN ai_cost_lifetime_cents bigint NOT NULL DEFAULT 0,
  ADD COLUMN ai_run_count_lifetime integer NOT NULL DEFAULT 0,
  ADD COLUMN ai_cost_mtd_started_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN ai_run_lock_until timestamptz;
