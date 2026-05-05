-- Phase 5 — Auction Platform Export
--
-- Schema additions for the AF360 / HiBid export pipeline. All additive,
-- no destructive changes. Existing rows preserved.
--
-- customer.seller_code: per-Customer code that AF360 expects in the CSV's
--   SellerCode column. DB-nullable; required-ness enforced at the
--   application layer (Zod required at create; export endpoint blocks
--   when null/empty). Existing customers carry NULL post-migration; the
--   admin updates each customer's value via the new Customer edit UI.
--
-- customer.disabled_at: soft-deactivation marker mirroring app_user.disabled_at
--   from Phase 4. Disabled customers are hidden from the cataloging picker
--   and new-job creation flows, but remain visible in admin lists.
--
-- job.start_bid: AF360 StartBid default ($5.00). Required at DB layer
--   because every job must produce a valid CSV value at export time.
--
-- job.shippable: AF360 Shippable default (false). Same reasoning.
--
-- Audit triggers + RLS policies: pick up the new columns automatically
-- (audit_log_trigger uses jsonb introspection; RLS is row-level).

ALTER TABLE customer
  ADD COLUMN seller_code text;

ALTER TABLE customer
  ADD COLUMN disabled_at timestamptz;

ALTER TABLE job
  ADD COLUMN start_bid numeric(10,2) NOT NULL DEFAULT 5.00;

ALTER TABLE job
  ADD COLUMN shippable boolean NOT NULL DEFAULT false;
