-- 0014_label_reprint_needed.sql
-- REQ — Lot-number compaction (2026-05-08)
--
-- Adds `lot.label_reprint_needed` so the compact-lot-numbers operation
-- (POST /api/jobs/:id/compact-lots) can flag exactly the lots whose
-- physical labels are now wrong. The operator sees a "Reprint" pill on
-- the affected lot rows and can filter by `?reprintPending=true` from
-- the inventory list. The flag is auto-cleared when the operator
-- requests a fresh label render via /api/labels/render — that's the
-- closest signal we have to "the label has been re-printed", short of
-- the Browser Print helper reporting back.
--
-- Default false; existing rows opt out automatically. NOT NULL because
-- a tri-state (NULL / true / false) gains nothing and complicates the
-- filter clause.

ALTER TABLE lot
  ADD COLUMN label_reprint_needed boolean NOT NULL DEFAULT false;

-- Partial index for the filter case. Most lots will have the flag
-- false; the partial index keeps it small and the WHERE-true scan fast.
CREATE INDEX lot_label_reprint_needed_idx
  ON lot (job_id)
  WHERE label_reprint_needed = true;
