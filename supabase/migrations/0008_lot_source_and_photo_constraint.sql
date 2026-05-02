-- supabase/migrations/0008_lot_source_and_photo_constraint.sql
--
-- Phase 3 invariant: every lot whose source is `cataloging` must have at
-- least one lot_photo row. Lots imported through future bulk-import
-- pathways (Amazon returns spreadsheets, etc.) are tagged source='imported'
-- and exempt from the rule (photos may be added later).
--
-- The cataloging API path already creates the lot row + first lot_photo row
-- atomically inside one transaction. The constraint trigger is DEFERRABLE
-- INITIALLY DEFERRED so it checks at COMMIT time, not on each statement —
-- which means the lot row is briefly photo-less inside the transaction
-- (between the lot insert and the lot_photo insert) without tripping.
--
-- Last-photo-delete behavior: the trigger rejects a delete that would leave
-- a source='cataloging' lot photo-less. The UI is responsible for offering
-- "delete this photo and the lot together" as the user-facing action; the
-- direct DELETE call on the photo by itself is correctly rejected.

-- 1. New enum type for lot source
CREATE TYPE lot_source AS ENUM ('cataloging', 'imported');

-- 2. Add source column to lot. NOT NULL with default 'cataloging' so all
--    existing rows are tagged as cataloging (which is correct — they were
--    seeded as if cataloged, and they all have photos as of seed-test-photos).
ALTER TABLE public.lot
  ADD COLUMN source lot_source NOT NULL DEFAULT 'cataloging';

-- 3. Constraint enforcement function. Reads the lot's current source and
--    counts its photos; raises if a cataloging-source lot has zero photos.
--    Returns NULL if the lot no longer exists (cascade-delete case) so
--    deleting an entire lot doesn't trip the check on its photos.
CREATE OR REPLACE FUNCTION public.enforce_lot_has_photo()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_lot_id uuid;
  v_source lot_source;
  v_photo_count int;
BEGIN
  -- Identify the affected lot. lot_photo triggers fire on DELETE only.
  IF TG_TABLE_NAME = 'lot' THEN
    v_lot_id := NEW.id;
  ELSIF TG_TABLE_NAME = 'lot_photo' THEN
    v_lot_id := OLD.lot_id;
  END IF;

  -- Look up the lot's source. NULL means the lot itself was deleted in this
  -- transaction (cascade delete dropped its photos); nothing to enforce.
  SELECT source INTO v_source FROM public.lot WHERE id = v_lot_id;
  IF v_source IS NULL THEN
    RETURN NULL;
  END IF;

  -- Source-based exemption applies ONLY at lot creation / source-update time.
  -- The "imported" tag exists so bulk-import flows (e.g., Amazon returns
  -- spreadsheets) can create photo-less lots that operators later attach
  -- photos to. But once a lot has at least one photo — regardless of how
  -- it was created — the rule "≥1 photo at all times" applies on photo
  -- delete. So the source check is skipped when this trigger fires from
  -- lot_photo DELETE; the photo-count check below applies universally then.
  IF TG_TABLE_NAME = 'lot' AND v_source <> 'cataloging' THEN
    RETURN NULL;  -- imported lots can be created/updated with zero photos
  END IF;

  SELECT COUNT(*) INTO v_photo_count
    FROM public.lot_photo WHERE lot_id = v_lot_id;

  IF v_photo_count = 0 THEN
    RAISE EXCEPTION
      'Lot % must have at least one photo. To remove the last photo, delete the lot.',
      v_lot_id;
  END IF;

  RETURN NULL;
END;
$$;

-- 4. Constraint triggers — deferrable so the rule fires at COMMIT, not per
--    statement. Allows the cataloging insert path to insert lot then photo
--    in one transaction without tripping mid-flight.
DROP TRIGGER IF EXISTS lot_has_photo_after_insert ON public.lot;
CREATE CONSTRAINT TRIGGER lot_has_photo_after_insert
  AFTER INSERT ON public.lot
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_lot_has_photo();

DROP TRIGGER IF EXISTS lot_has_photo_after_source_update ON public.lot;
CREATE CONSTRAINT TRIGGER lot_has_photo_after_source_update
  AFTER UPDATE OF source ON public.lot
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_lot_has_photo();

DROP TRIGGER IF EXISTS lot_photo_delete_check ON public.lot_photo;
CREATE CONSTRAINT TRIGGER lot_photo_delete_check
  AFTER DELETE ON public.lot_photo
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_lot_has_photo();
