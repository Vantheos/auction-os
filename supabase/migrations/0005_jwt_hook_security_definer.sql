-- Fix: make the JWT custom-claim hook SECURITY DEFINER so it can read
-- public.app_user past the RLS policies installed in 0003_rls_policies.sql.
--
-- Without SECURITY DEFINER, the function runs as supabase_auth_admin, which has
-- GRANT SELECT on app_user but is still subject to the table's row-level
-- security policies. Those policies require public.current_role() = 'admin',
-- which is never true at hook-execution time (the hook runs *before* the JWT
-- is issued, so auth.jwt() doesn't yet contain a role claim). Result: the
-- SELECT returns zero rows and the hook writes app_metadata.role = null.
--
-- SECURITY DEFINER makes the function run as its owner (postgres), which
-- bypasses RLS. We also lock down search_path to prevent shimming attacks.

ALTER FUNCTION public.custom_access_token_hook(jsonb) SECURITY DEFINER;
ALTER FUNCTION public.custom_access_token_hook(jsonb) SET search_path = public;
