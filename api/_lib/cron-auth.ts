// api/_lib/cron-auth.ts
// Auth gate for Vercel cron handlers. Cron requests carry a bearer token
// matching CRON_SECRET; any other request is rejected. Vercel itself sets
// the Authorization header automatically when invoking a registered cron;
// the same token works for local / scripted invocation during tests.

import type { IncomingMessage } from 'node:http';
import { AuthError } from './auth.js';

export function requireCronAuth(req: IncomingMessage): void {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    throw new AuthError(500, 'CRON_NOT_CONFIGURED', 'CRON_SECRET env var is not set');
  }
  const header = req.headers.authorization;
  if (!header || typeof header !== 'string' || !header.startsWith('Bearer ')) {
    throw new AuthError(401, 'UNAUTHENTICATED', 'Missing cron bearer token');
  }
  const token = header.slice(7);
  if (token !== expected) {
    throw new AuthError(401, 'INVALID_CRON_TOKEN', 'Cron token did not match');
  }
}
