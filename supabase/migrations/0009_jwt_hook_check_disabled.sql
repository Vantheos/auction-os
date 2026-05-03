-- Phase 4 — Area 1: gate the JWT custom-claim hook on app_user.disabled_at.
--
-- The disabled_at column was added to app_user in Phase 1 as a forward-
-- looking schema choice, and the PATCH endpoint already accepts a `disabled`
-- boolean toggle that writes the timestamp. The missing piece was wiring
-- the JWT hook to skip disabled users so they lose access at next token
-- refresh (Supabase TTL ~1 hour).
--
-- Behavior:
--   - Active user (disabled_at IS NULL): role claim issued as before
--   - Disabled user: SELECT returns no row → user_role IS NULL → existing
--     ELSE branch writes app_metadata.role = null (same as missing user)
--   - The downstream RLS policies and requireAuth middleware already deny
--     access when role claim is null, so no other change is needed.
--
-- Preserves SECURITY DEFINER + locked search_path from migration 0005.

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  claims jsonb;
  user_role text;
BEGIN
  -- Look up the user's role; skip disabled users.
  SELECT role::text INTO user_role
  FROM public.app_user
  WHERE id = (event->>'user_id')::uuid
    AND disabled_at IS NULL;

  -- Read the existing claims object
  claims := event->'claims';

  -- Inject role under app_metadata.role (RLS reads from auth.jwt()->'app_metadata'->'role')
  IF user_role IS NOT NULL THEN
    claims := jsonb_set(claims, '{app_metadata,role}', to_jsonb(user_role));
  ELSE
    -- No app_user row, or user is disabled: omit the role claim.
    -- Indistinguishable from a missing user by design (per Phase 4 spec
    -- decision D1); RLS will deny everything either way.
    claims := jsonb_set(claims, '{app_metadata,role}', 'null'::jsonb);
  END IF;

  -- Update the event and return it
  event := jsonb_set(event, '{claims}', claims);
  RETURN event;
END;
$$;
