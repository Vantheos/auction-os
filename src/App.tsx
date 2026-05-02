import { Routes, Route } from 'react-router-dom';
import { lazy, Suspense, useEffect } from 'react';
import { Login } from './routes/Login';
import { Customers } from './routes/Customers';
import { CustomerDetail } from './routes/CustomerDetail';
import { DesignSystem } from './routes/DesignSystem';
import { AdminShell } from './components/shell/AdminShell';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { useRole } from './lib/auth';
import { homeRouteFor } from './lib/role';
import { useNavigate, useLocation } from 'react-router-dom';
import { startProcessor } from './lib/upload-processor';

const Inventory = lazy(() => import('./routes/Inventory').then((m) => ({ default: m.Inventory })));
const LotDetailPage = lazy(() => import('./routes/LotDetailPage').then((m) => ({ default: m.LotDetailPage })));
const Settings = lazy(() => import('./routes/Settings').then((m) => ({ default: m.Settings })));
const Catalog = lazy(() => import('./routes/Catalog').then((m) => ({ default: m.Catalog })));
const CatalogSession = lazy(() => import('./routes/CatalogSession').then((m) => ({ default: m.CatalogSession })));
const CatalogPhotos = lazy(() => import('./routes/CatalogPhotos').then((m) => ({ default: m.CatalogPhotos })));

const Loading = () => <div className="p-8 text-sm text-textDim">Loading…</div>;

// Route used by Login.tsx as the default landing page after sign-in.
// Picks the correct home for the current role and redirects.
function RoleHomeRedirect() {
  const role = useRole();
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => {
    if (!role) return;
    const search = new URLSearchParams(location.search);
    const requested = search.get('redirect');
    navigate(requested ?? homeRouteFor(role), { replace: true });
  }, [role, navigate, location.search]);
  return <Loading />;
}

export function App() {
  // Start the upload-queue processor once when the app boots so any pending
  // entries from a previous session resume immediately.
  useEffect(() => {
    void startProcessor();
  }, []);

  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      {/* Cataloging session screens stand alone (no rail nav) — focused workflow.
          The /catalog picker itself sits inside AdminShell below so admin/office
          users can navigate back to other pages. */}
      <Route path="/catalog/session" element={
        <ProtectedRoute>
          <Suspense fallback={<Loading />}><CatalogSession /></Suspense>
        </ProtectedRoute>
      } />
      <Route path="/catalog/session/photos" element={
        <ProtectedRoute>
          <Suspense fallback={<Loading />}><CatalogPhotos /></Suspense>
        </ProtectedRoute>
      } />

      {/* Single-lot mobile-friendly view (used by QR scans, deep links) */}
      <Route path="/lot/:id" element={
        <ProtectedRoute>
          <Suspense fallback={<Loading />}><LotDetailPage /></Suspense>
        </ProtectedRoute>
      } />

      {/* Desktop admin shell (rail nav). Inventory open to all; Customers
          admin/office; Settings admin-only. */}
      <Route element={<ProtectedRoute><AdminShell /></ProtectedRoute>}>
        <Route path="/inventory" element={<Suspense fallback={<Loading />}><Inventory /></Suspense>} />
        <Route path="/catalog" element={<Suspense fallback={<Loading />}><Catalog /></Suspense>} />
        <Route path="/customers" element={
          <ProtectedRoute allow={['admin', 'office']}><Customers /></ProtectedRoute>
        } />
        <Route path="/customers/:id" element={
          <ProtectedRoute allow={['admin', 'office']}><CustomerDetail /></ProtectedRoute>
        } />
        <Route path="/settings" element={
          <ProtectedRoute allow={['admin']}>
            <Suspense fallback={<Loading />}><Settings /></Suspense>
          </ProtectedRoute>
        } />
        <Route path="/design-system" element={<DesignSystem />} />
      </Route>

      {/* Role-aware default landing — preserves a ?redirect= target if present */}
      <Route path="/" element={<ProtectedRoute><RoleHomeRedirect /></ProtectedRoute>} />
      <Route path="*" element={<ProtectedRoute><RoleHomeRedirect /></ProtectedRoute>} />
    </Routes>
  );
}
