import { handle } from '@hono/node-server/vercel';
// api/jobs/[id].ts
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { createApp } from '../_app';
import { authMiddleware, requireRole } from '../_middleware/auth';
import { getDb } from '../_lib/db';
import { job } from '../../db/schema';
import { jsonError } from '../_lib/responses';

const app = createApp();
app.use('/api/jobs/:id', authMiddleware);

const PatchSchema = z.object({
  jobNumber: z.string().min(1).max(200).optional(),
  closed: z.boolean().optional(),
});

app.get('/api/jobs/:id', async (c) => {
  const db = getDb();
  const [row] = await db.select().from(job).where(eq(job.id, c.req.param('id')));
  if (!row) return jsonError(c, 404, 'NOT_FOUND', 'Job not found');
  return c.json(row);
});

app.patch('/api/jobs/:id', requireRole('admin', 'office'), async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => null);
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) return jsonError(c, 400, 'INVALID_BODY', parsed.error.issues[0].message);

  const update: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.data.jobNumber !== undefined) update.jobNumber = parsed.data.jobNumber;
  if (parsed.data.closed !== undefined) update.closedAt = parsed.data.closed ? new Date() : null;

  const db = getDb();
  const [row] = await db.update(job).set(update).where(eq(job.id, id)).returning();
  if (!row) return jsonError(c, 404, 'NOT_FOUND', 'Job not found');
  return c.json(row);
});

app.delete('/api/jobs/:id', requireRole('admin'), async (c) => {
  const db = getDb();
  const [row] = await db.delete(job).where(eq(job.id, c.req.param('id'))).returning();
  if (!row) return jsonError(c, 404, 'NOT_FOUND', 'Job not found');
  return c.json({ ok: true });
});

export const fetch = (req: Request) => app.fetch(req);
export default handle(app);
