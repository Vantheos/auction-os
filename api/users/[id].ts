import { handle } from '@hono/node-server/vercel';
// api/users/[id].ts
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { createApp } from '../_app.js';
import { authMiddleware, requireRole } from '../_middleware/auth.js';
import { getDb } from '../_lib/db.js';
import { appUser } from '../../db/schema.js';
import { jsonError } from '../_lib/responses.js';

const app = createApp();
app.use('/api/users/:id', authMiddleware);

const PatchSchema = z.object({
  role: z.enum(['admin', 'office', 'warehouse']).optional(),
  displayName: z.string().min(1).max(200).optional(),
  disabled: z.boolean().optional(),
});

app.patch('/api/users/:id', requireRole('admin'), async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => null);
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) return jsonError(c, 400, 'INVALID_BODY', parsed.error.issues[0].message);

  const update: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.data.role !== undefined) update.role = parsed.data.role;
  if (parsed.data.displayName !== undefined) update.displayName = parsed.data.displayName;
  if (parsed.data.disabled !== undefined) update.disabledAt = parsed.data.disabled ? new Date() : null;

  const db = getDb();
  const [row] = await db.update(appUser).set(update).where(eq(appUser.id, id)).returning();
  if (!row) return jsonError(c, 404, 'NOT_FOUND', 'User not found');
  return c.json(row);
});

export const testFetch = (req: Request) => app.fetch(req);
export default handle(app);
