import { Routes, Route, Navigate } from 'react-router-dom';
import { Login } from './routes/Login';
import { Customers } from './routes/Customers';
import { CustomerDetail } from './routes/CustomerDetail';
import { AdminShell } from './components/shell/AdminShell';
import { ProtectedRoute } from './components/auth/ProtectedRoute';

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<ProtectedRoute><AdminShell /></ProtectedRoute>}>
        <Route path="/customers" element={<Customers />} />
        <Route path="/customers/:id" element={<CustomerDetail />} />
        <Route path="/" element={<Navigate to="/customers" replace />} />
        <Route path="*" element={<Navigate to="/customers" replace />} />
      </Route>
    </Routes>
  );
}
