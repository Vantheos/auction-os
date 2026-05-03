import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { signOut, useSession, useRole } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';

type AllowedRoles = ('admin' | 'office' | 'warehouse')[];

const NAV: { to: string; label: string; enabled: boolean; roles?: AllowedRoles }[] = [
  { to: '/inventory',  label: 'Inventory', enabled: true },
  { to: '/catalog',    label: 'Catalog',   enabled: true },
  { to: '/customers',  label: 'Customers', enabled: true, roles: ['admin', 'office'] },
  { to: '/users',      label: 'Users',     enabled: true,  roles: ['admin'] },
  { to: '/settings',   label: 'Settings',  enabled: true,  roles: ['admin'] },
  { to: '/audit',      label: 'Audit',     enabled: false, roles: ['admin'] },
];

export function AdminShell() {
  const { session } = useSession();
  const role = useRole();
  const navigate = useNavigate();
  const { clearAll } = useToast();

  const visibleNav = NAV.filter((item) => !item.roles || (role && item.roles.includes(role)));

  // Navigate to a clean /login BEFORE signOut so the URL doesn't carry the
  // stale path through the session boundary. Without this, ProtectedRoute
  // sees the session vanish at /<current path> and bounces to
  // /login?redirect=/<current path> — which would then override the next
  // user's role-home on sign-in.
  //
  // clearAll() drops any persistent toasts (e.g., the user-creation password
  // toast which has a 30s duration but might still be on screen) so they
  // don't carry over into the next user's session.
  const handleSignOut = () => {
    clearAll();
    navigate('/login', { replace: true });
    void signOut();
  };

  return (
    <div className="h-[100dvh] flex bg-wash">
      <aside className="w-40 bg-surface border-r border-border p-4 flex flex-col overflow-y-auto">
        <div className="font-semibold text-lg mb-6">Auction OS</div>
        <nav className="space-y-1 flex-1">
          {visibleNav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              aria-disabled={!item.enabled}
              className={({ isActive }) =>
                `block px-3 py-2 rounded text-sm ${
                  !item.enabled ? 'text-textFaint cursor-not-allowed pointer-events-none' :
                  isActive ? 'bg-info-bg text-brand font-medium' : 'text-textDim hover:bg-surfaceAlt'
                }`
              }
            >
              {item.label}{!item.enabled && ' (later)'}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-border pt-4 mt-4 space-y-2">
          <div className="text-xs text-textDim truncate">{session?.user.email}</div>
          <div className="text-xs text-textFaint">{role}</div>
          <Button variant="ghost" size="sm" className="w-full justify-start" onClick={handleSignOut}>Sign out</Button>
        </div>
      </aside>
      <main className="flex-1 p-6 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
