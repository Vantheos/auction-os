// api/_app.ts
import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { cors } from 'hono/cors';
import type { AuthContext } from './_middleware/auth';

export function createApp() {
  const app = new Hono<AuthContext>();
  app.use('*', logger());
  app.use('*', cors({ origin: ['http://localhost:5173'], credentials: true }));
  return app;
}
