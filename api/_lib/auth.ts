// api/_lib/auth.ts
// JWT verification + role check for native Vercel handlers.
// Replaces the Hono-based middleware in api/_middleware/auth.ts.

import type { IncomingMessage } from 'node:http';
import { createRemoteJWKSet, jwtVerify } from 'jose';

export type Role = 'admin' | 'office' | 'warehouse';
export type AuthInfo = { userId: string; role: Role };

export class AuthError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

let _jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
function getJwks() {
  if (_jwks) return _jwks;
  const url = process.env.SUPABASE_URL;
  if (!url) throw new Error('SUPABASE_URL not set');
  return (_jwks = createRemoteJWKSet(new URL(`${url}/auth/v1/.well-known/jwks.json`)));
}

// Verifies the bearer token, returns userId + role. If `allowed` is non-empty,
// also enforces that role ∈ allowed. Throws AuthError on any failure.
export async function requireAuth(req: IncomingMessage, ...allowed: Role[]): Promise<AuthInfo> {
  const header = req.headers.authorization;
  if (!header || typeof header !== 'string' || !header.startsWith('Bearer ')) {
    throw new AuthError(401, 'UNAUTHENTICATED', 'Missing bearer token');
  }
  const token = header.slice(7);

  let payload: Record<string, unknown>;
  try {
    ({ payload } = await jwtVerify(token, getJwks(), { algorithms: ['ES256'] }));
  } catch {
    throw new AuthError(401, 'INVALID_TOKEN', 'Token verification failed');
  }

  const userId = typeof payload.sub === 'string' ? payload.sub : null;
  const appMeta = payload.app_metadata as { role?: Role } | undefined;
  const role = appMeta?.role;

  if (!userId || !role) {
    throw new AuthError(401, 'INVALID_TOKEN', 'Token is missing required claims');
  }
  if (allowed.length > 0 && !allowed.includes(role)) {
    throw new AuthError(403, 'FORBIDDEN', `Role ${role} cannot perform this action`);
  }
  return { userId, role };
}

// Test-only escape hatch: override the JWKS used for verification.
// Called by tests/helpers/setup.ts. The injected value can be either a
// remote or local JWKS — both are key-resolver functions accepted by
// jwtVerify. Typed as the remote variant for ergonomics.
export function setJwksForTesting(testJwks: unknown) {
  _jwks = testJwks as ReturnType<typeof createRemoteJWKSet>;
}
