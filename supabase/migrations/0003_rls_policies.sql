-- Helper: read role from JWT
CREATE OR REPLACE FUNCTION public.current_role()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT auth.jwt() -> 'app_metadata' ->> 'role';
$$;

-- ── Enable RLS on every v1 table ────────────────────────────────────────
ALTER TABLE public.app_user        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lot             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lot_photo       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log       ENABLE ROW LEVEL SECURITY;

-- ── app_user: admin-only read/write ─────────────────────────────────────
CREATE POLICY app_user_admin_select ON public.app_user FOR SELECT
  USING (public.current_role() = 'admin');
CREATE POLICY app_user_admin_modify ON public.app_user FOR ALL
  USING (public.current_role() = 'admin')
  WITH CHECK (public.current_role() = 'admin');

-- ── customer: SELECT all authenticated; mutations admin/office; DELETE admin
CREATE POLICY customer_select ON public.customer FOR SELECT
  USING (public.current_role() IN ('admin', 'office', 'warehouse'));
CREATE POLICY customer_insert ON public.customer FOR INSERT
  WITH CHECK (public.current_role() IN ('admin', 'office'));
CREATE POLICY customer_update ON public.customer FOR UPDATE
  USING (public.current_role() IN ('admin', 'office'))
  WITH CHECK (public.current_role() IN ('admin', 'office'));
CREATE POLICY customer_delete ON public.customer FOR DELETE
  USING (public.current_role() = 'admin');

-- ── job: same shape as customer ─────────────────────────────────────────
CREATE POLICY job_select ON public.job FOR SELECT
  USING (public.current_role() IN ('admin', 'office', 'warehouse'));
CREATE POLICY job_insert ON public.job FOR INSERT
  WITH CHECK (public.current_role() IN ('admin', 'office'));
CREATE POLICY job_update ON public.job FOR UPDATE
  USING (public.current_role() IN ('admin', 'office'))
  WITH CHECK (public.current_role() IN ('admin', 'office'));
CREATE POLICY job_delete ON public.job FOR DELETE
  USING (public.current_role() = 'admin');

-- ── lot, lot_photo: SELECT/INSERT all authenticated; UPDATE blocked when frozen; DELETE admin
-- (Phase 2/4 will add INSERT/UPDATE policies; for Phase 1 just open SELECT.)
CREATE POLICY lot_select ON public.lot FOR SELECT
  USING (public.current_role() IN ('admin', 'office', 'warehouse'));
CREATE POLICY lot_insert ON public.lot FOR INSERT
  WITH CHECK (public.current_role() IN ('admin', 'office', 'warehouse'));
CREATE POLICY lot_update ON public.lot FOR UPDATE
  USING (
    public.current_role() IN ('admin', 'office', 'warehouse')
    AND state IN ('assigned', 'unassigned', 'sold')
  )
  WITH CHECK (
    public.current_role() IN ('admin', 'office', 'warehouse')
    AND state IN ('assigned', 'unassigned', 'sold')
  );
CREATE POLICY lot_delete ON public.lot FOR DELETE
  USING (public.current_role() = 'admin');

CREATE POLICY lot_photo_select ON public.lot_photo FOR SELECT
  USING (public.current_role() IN ('admin', 'office', 'warehouse'));
CREATE POLICY lot_photo_insert ON public.lot_photo FOR INSERT
  WITH CHECK (public.current_role() IN ('admin', 'office', 'warehouse'));
CREATE POLICY lot_photo_update ON public.lot_photo FOR UPDATE
  USING (public.current_role() IN ('admin', 'office', 'warehouse'))
  WITH CHECK (public.current_role() IN ('admin', 'office', 'warehouse'));
CREATE POLICY lot_photo_delete ON public.lot_photo FOR DELETE
  USING (public.current_role() = 'admin');

-- ── system_settings: SELECT all authenticated; UPDATE admin
CREATE POLICY system_settings_select ON public.system_settings FOR SELECT
  USING (public.current_role() IN ('admin', 'office', 'warehouse'));
CREATE POLICY system_settings_update ON public.system_settings FOR UPDATE
  USING (public.current_role() = 'admin')
  WITH CHECK (public.current_role() = 'admin');

-- ── audit_log: admin-only SELECT; INSERT only via SECURITY DEFINER trigger
CREATE POLICY audit_log_admin_select ON public.audit_log FOR SELECT
  USING (public.current_role() = 'admin');
-- No INSERT/UPDATE/DELETE policies → only SECURITY DEFINER functions can write
