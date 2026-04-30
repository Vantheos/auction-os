import { NavLink, Outlet } from 'react-router-dom';
import { signOut, useSession, useRole } from '@/lib/auth';
import { Button } from '@/components/ui/button';

const NAV = [
  { to: '/inventory', label: 'Inventory', enabled: false },
  { to: '/customers', label: 'Customers', enabled: true },
  { to: '/users', label: 'Users', enabled: false },
  { to: '/settings', label: 'Settings', enabled: false },
  { to: '/audit', label: 'Audit', enabled: false },
];

export function AdminShell() {
  const { session } = useSession();
  const role = useRole();

  return (
    <div className="min-h-screen flex bg-wash">
      <aside className="w-56 bg-surface border-r border-border p-4 flex flex-col">
        <div className="font-semibold text-lg mb-6">Auction OS</div>
        <nav className="space-y-1 flex-1">
          {NAV.map((item) => (
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
