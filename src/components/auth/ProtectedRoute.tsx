import { Navigate } from 'react-router-dom';
import { useSession, useRole, type AppRole } from '@/lib/auth';

export function ProtectedRoute({ children, allow }: { children: React.ReactNode; allow?: AppRole[] }) {
  const { session, loading } = useSession();
  const role = useRole();
  if (loading) return <div className="p-8 text-textDim">Loading…</div>;
  if (!session) return <Navigate to="/login" replace />;
  if (allow && role && !allow.includes(role)) return <Navigate to="/customers" replace />;
  return <>{children}</>;
}
