import { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { signOut, useSession, useRole, type AppRole } from '@/lib/auth';
import { homeRouteFor } from '@/lib/role';

export function ProtectedRoute({ children, allow }: { children: React.ReactNode; allow?: AppRole[] }) {
  const { session, loading } = useSession();
  const role = useRole();
  const location = useLocation();

  // Phase 4 Area 1: a disabled user can still sign in at the Supabase auth
  // level (auth.users isn't disabled — only app_user.disabled_at). Their
  // JWT carries app_metadata.role = null because of the gated hook
  // (migration 0009). Without this branch, they'd sit on the loading
  // screen forever (RoleHomeRedirect early-returns when role is null).
  // Detect the case + sign out client-side + bounce to /login with an
  // inactive-account flag.
  const isDisabledSession = !loading && !!session && !role;
  useEffect(() => {
    if (isDisabledSession) {
      void signOut();
    }
  }, [isDisabledSession]);

  if (loading) return <div className="p-8 text-textDim">Loading…</div>;
  if (isDisabledSession) {
    return <Navigate to="/login?inactive=1" replace />;
  }
  if (!session) {
    const target = location.pathname + location.search;
    return <Navigate to={`/login?redirect=${encodeURIComponent(target)}`} replace />;
  }
  if (allow && role && !allow.includes(role)) {
    // Failed role gate — redirect to the role's home (warehouse → /catalog,
    // others → /inventory) rather than a generic page.
    return <Navigate to={homeRouteFor(role)} replace />;
  }
  return <>{children}</>;
}
