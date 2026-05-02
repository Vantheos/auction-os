// src/hooks/useRoleGate.ts
// Thin wrapper around useRole for route-gate guards. Returns a redirect
// target when the current role isn't in the allowlist, or null when access
// is allowed. Used by ProtectedRoute and (occasionally) by component-level
// gates that hide UI rather than redirect.

import { useRole } from '@/lib/auth';
import { homeRouteFor, type Role } from '@/lib/role';

export function useRoleGate(allowedRoles?: Role[]): {
  role: Role | null;
  allowed: boolean;
  redirectTo: string | null;
} {
  const role = useRole() as Role | null;
  if (!role) {
    return { role: null, allowed: false, redirectTo: '/login' };
  }
  if (!allowedRoles || allowedRoles.includes(role)) {
    return { role, allowed: true, redirectTo: null };
  }
  return { role, allowed: false, redirectTo: homeRouteFor(role) };
}
