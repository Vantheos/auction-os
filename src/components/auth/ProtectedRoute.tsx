import { Navigate, useLocation } from 'react-router-dom';
import { useSession, useRole, type AppRole } from '@/lib/auth';
import { homeRouteFor } from '@/lib/role';

export function ProtectedRoute({ children, allow }: { children: React.ReactNode; allow?: AppRole[] }) {
  const { session, loading } = useSession();
  const role = useRole();
  const location = useLocation();
  if (loading) return <div className="p-8 text-textDim">Loading…</div>;
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
