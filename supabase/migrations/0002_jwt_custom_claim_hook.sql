-- Custom Access Token Hook: inject role from app_user into JWT app_metadata
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  claims jsonb;
  user_role text;
BEGIN
  -- Look up the user's role
  SELECT role::text INTO user_role
  FROM public.app_user
  WHERE id = (event->>'user_id')::uuid;

  -- Read the existing claims object
  claims := event->'claims';

  -- Inject role under app_metadata.role (RLS reads from auth.jwt()->'app_metadata'->'role')
  IF user_role IS NOT NULL THEN
    claims := jsonb_set(claims, '{app_metadata,role}', to_jsonb(user_role));
  ELSE
    -- No app_user row: omit the role claim (RLS will deny everything)
    claims := jsonb_set(claims, '{app_metadata,role}', 'null'::jsonb);
  END IF;

  -- Update the event and return it
  event := jsonb_set(event, '{claims}', claims);
  RETURN event;
END;
$$;

-- Grant Supabase Auth permission to call the function
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO supabase_auth_admin;
GRANT SELECT ON public.app_user TO supabase_auth_admin;

-- Revoke from less-privileged roles
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) FROM authenticated, anon, public;
