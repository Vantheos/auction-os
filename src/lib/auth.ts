import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import type { Session } from '@supabase/supabase-js';

export type AppRole = 'admin' | 'office' | 'warehouse';

export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  return { session, loading };
}

// The Supabase Auth Custom Access Token Hook injects `app_metadata.role` into
// the JWT at token issue time, sourced from public.app_user. That value is NOT
// reflected in `session.user.app_metadata` (which is populated from the static
// auth.users.raw_app_meta_data). Decode the JWT directly to read the dynamic
// role claim.
function decodeJwtPayload(token: string): { app_metadata?: { role?: string } } | null {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), '=');
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

export function useRole(): AppRole | null {
  const { session } = useSession();
  const token = session?.access_token;
  if (!token) return null;
  const payload = decodeJwtPayload(token);
  const role = payload?.app_metadata?.role;
  return role === 'admin' || role === 'office' || role === 'warehouse' ? role : null;
}

export async function signIn(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signOut() {
  await supabase.auth.signOut();
}
