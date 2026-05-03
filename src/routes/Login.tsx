import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { signIn } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function Login() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  // ?inactive=1 set by ProtectedRoute when a disabled user lands here after
  // their session is signed out client-side. Surface the reason so they
  // know to contact an admin rather than retry blindly.
  const [error, setError] = useState<string | null>(
    params.get('inactive') === '1'
      ? 'This account has been disabled. Contact an admin to regain access.'
      : null,
  );
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await signIn(email, password);
      // Send to /redirect/home if a `redirect=` is present, else to / which
      // resolves to the role-appropriate home (warehouse → /catalog,
      // others → /inventory).
      const requested = params.get('redirect');
      if (requested) {
        nav(`/?redirect=${encodeURIComponent(requested)}`, { replace: true });
      } else {
        nav('/', { replace: true });
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-wash p-4">
      <form onSubmit={onSubmit} className="bg-surfaceSolid p-8 rounded-lg shadow-md w-full max-w-md space-y-4 border border-border">
        <h1 className="text-xl font-semibold">Auction OS — Sign in</h1>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
        <Button type="submit" className="w-full" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</Button>
      </form>
    </div>
  );
}
