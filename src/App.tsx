import { Routes, Route, Navigate } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { Login } from './routes/Login';
import { Customers } from './routes/Customers';
import { CustomerDetail } from './routes/CustomerDetail';
import { DesignSystem } from './routes/DesignSystem';
import { AdminShell } from './components/shell/AdminShell';
import { ProtectedRoute } from './components/auth/ProtectedRoute';

const Inventory = lazy(() => import('./routes/Inventory').then((m) => ({ default: m.Inventory })));
const LotDetailPage = lazy(() => import('./routes/LotDetailPage').then((m) => ({ default: m.LotDetailPage })));
const Settings = lazy(() => import('./routes/Settings').then((m) => ({ default: m.Settings })));

const Loading = () => <div className="p-8 text-sm text-textDim">Loading…</div>;

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/lot/:id" element={<ProtectedRoute><Suspense fallback={<Loading />}><LotDetailPage /></Suspense></ProtectedRoute>} />
      <Route element={<ProtectedRoute><AdminShell /></ProtectedRoute>}>
        <Route path="/inventory" element={<Suspense fallback={<Loading />}><Inventory /></Suspense>} />
        <Route path="/customers" element={<Customers />} />
        <Route path="/customers/:id" element={<CustomerDetail />} />
        <Route path="/settings" element={<Suspense fallback={<Loading />}><Settings /></Suspense>} />
        <Route path="/design-system" element={<DesignSystem />} />
        <Route path="/" element={<Navigate to="/inventory" replace />} />
        <Route path="*" element={<Navigate to="/inventory" replace />} />
      </Route>
    </Routes>
  );
}
