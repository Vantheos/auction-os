-- supabase/migrations/0007_lot_photos_storage_policies.sql
--
-- RLS policies for the `lot-photos` Supabase Storage bucket. The bucket itself
-- is created manually in the Studio dashboard (private; allowed MIME image/jpeg,
-- image/png; size limit 15 MB) — Studio bucket creation is not capturable in
-- migration SQL because it lives in `storage.buckets` which is managed by
-- Supabase tooling.
--
-- Policies use the same `public.current_role()` helper introduced in
-- 0003_rls_policies.sql. Permissions follow v1 spec §3:
--
--   SELECT  — admin/office/warehouse (needed for signed-URL read access)
--   INSERT  — admin/office/warehouse (browser-direct uploads via signed URL)
--   UPDATE  — admin/office/warehouse (re-upload over the same path; rare)
--   DELETE  — admin only (file removal happens via API endpoint with service
--             role; this policy guards direct-API-key abuse from a stolen
--             anon-role JWT)

-- Drop any leftover policies from prior attempts (idempotent for re-application)
DROP POLICY IF EXISTS lot_photos_storage_select ON storage.objects;
DROP POLICY IF EXISTS lot_photos_storage_insert ON storage.objects;
DROP POLICY IF EXISTS lot_photos_storage_update ON storage.objects;
DROP POLICY IF EXISTS lot_photos_storage_delete ON storage.objects;

CREATE POLICY lot_photos_storage_select ON storage.objects FOR SELECT
  USING (
    bucket_id = 'lot-photos'
    AND public.current_role() IN ('admin', 'office', 'warehouse')
  );

CREATE POLICY lot_photos_storage_insert ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'lot-photos'
    AND public.current_role() IN ('admin', 'office', 'warehouse')
  );

CREATE POLICY lot_photos_storage_update ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'lot-photos'
    AND public.current_role() IN ('admin', 'office', 'warehouse')
  )
  WITH CHECK (
    bucket_id = 'lot-photos'
    AND public.current_role() IN ('admin', 'office', 'warehouse')
  );

CREATE POLICY lot_photos_storage_delete ON storage.objects FOR DELETE
  USING (
    bucket_id = 'lot-photos'
    AND public.current_role() = 'admin'
  );
