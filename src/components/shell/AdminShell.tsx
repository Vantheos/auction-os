import { NavLink, Outlet } from 'react-router-dom';
import { signOut, useSession, useRole } from '@/lib/auth';
import { Button } from '@/components/ui/button';

type AllowedRoles = ('admin' | 'office' | 'warehouse')[];

const NAV: { to: string; label: string; enabled: boolean; roles?: AllowedRoles }[] = [
  { to: '/inventory',  label: 'Inventory', enabled: true },
  { to: '/catalog',    label: 'Catalog',   enabled: true },
  { to: '/customers',  label: 'Customers', enabled: true, roles: ['admin', 'office'] },
  { to: '/users',      label: 'Users',     enabled: false, roles: ['admin'] },
  { to: '/settings',   label: 'Settings',  enabled: true,  roles: ['admin'] },
  { to: '/audit',      label: 'Audit',     enabled: false, roles: ['admin'] },
];

export function AdminShell() {
  const { session } = useSession();
  const role = useRole();

  const visibleNav = NAV.filter((item) => !item.roles || (role && item.roles.includes(role)));

  return (
    <div className="min-h-screen flex bg-wash">
      <aside className="w-56 bg-surface border-r border-border p-4 flex flex-col">
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
          <Button variant="ghost" size="sm" className="w-full justify-start" onClick={() => signOut()}>Sign out</Button>
        </div>
      </aside>
      <main className="flex-1 p-6 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
