// api/_middleware/auth.ts
import { createMiddleware } from 'hono/factory';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { jsonError } from '../_lib/responses.js';

export type AuthContext = {
  Variables: {
    userId: string;
    role: 'admin' | 'office' | 'warehouse';
  };
};

// Lazily initialize the JWKS set from SUPABASE_URL on first verification.
// jose caches keys and refreshes them automatically on rotation.
let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
function getJwks() {
  if (!jwks) {
    const url = process.env.SUPABASE_URL;
    if (!url) throw new Error('SUPABASE_URL not set');
    jwks = createRemoteJWKSet(new URL(`${url}/auth/v1/.well-known/jwks.json`));
  }
  return jwks;
}

export const authMiddleware = createMiddleware<AuthContext>(async (c, next) => {
  const header = c.req.header('Authorization');
  if (!header?.startsWith('Bearer ')) {
    return jsonError(c, 401, 'UNAUTHENTICATED', 'Missing bearer token');
  }
  const token = header.slice(7);

  try {
    const { payload } = await jwtVerify(token, getJwks(), { algorithms: ['ES256'] });
    const userId = payload.sub;
    const role = (payload as any).app_metadata?.role;
    if (!userId || !role) {
      return jsonError(c, 401, 'INVALID_TOKEN', 'Token is missing required claims');
    }
    c.set('userId', userId);
    c.set('role', role);
    await next();
  } catch {
    return jsonError(c, 401, 'INVALID_TOKEN', 'Token verification failed');
  }
});

export function requireRole(...allowed: Array<'admin' | 'office' | 'warehouse'>) {
  return createMiddleware<AuthContext>(async (c, next) => {
    const role = c.get('role');
    if (!allowed.includes(role)) {
      return jsonError(c, 403, 'FORBIDDEN', `Role ${role} cannot perform this action`);
    }
    await next();
  });
}

// Test-only escape hatch: override the JWKS used for verification.
// Called by tests/helpers/setup.ts. Has no effect in production.
export function setJwksForTesting(testJwks: any) {
  jwks = testJwks;
}
