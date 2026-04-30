// api/_lib/responses.ts
import type { Context } from 'hono';

export function jsonError(c: Context, status: number, code: string, message: string) {
  return c.json({ error: { code, message } }, status as 400 | 401 | 403 | 404 | 409 | 500);
}
