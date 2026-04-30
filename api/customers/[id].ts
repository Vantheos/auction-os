import { handle } from '@hono/node-server/vercel';
// api/customers/[id].ts
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { createApp } from '../_app';
import { authMiddleware, requireRole } from '../_middleware/auth';
import { getDb } from '../_lib/db';
import { customer } from '../../db/schema';
import { jsonError } from '../_lib/responses';

const app = createApp();
app.use('/api/customers/:id', authMiddleware);

const UpdateSchema = z.object({ name: z.string().min(1).max(200).optional() });

app.get('/api/customers/:id', async (c) => {
  const id = c.req.param('id');
  const db = getDb();
  const [row] = await db.select().from(customer).where(eq(customer.id, id));
  if (!row) return jsonError(c, 404, 'NOT_FOUND', 'Customer not found');
  return c.json(row);
});

app.patch('/api/customers/:id', requireRole('admin', 'office'), async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => null);
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) return jsonError(c, 400, 'INVALID_BODY', parsed.error.issues[0].message);
  const db = getDb();
  const [row] = await db.update(customer).set({ ...parsed.data, updatedAt: new Date() }).where(eq(customer.id, id)).returning();
  if (!row) return jsonError(c, 404, 'NOT_FOUND', 'Customer not found');
  return c.json(row);
});

app.delete('/api/customers/:id', requireRole('admin'), async (c) => {
  const id = c.req.param('id');
  const db = getDb();
  const [row] = await db.delete(customer).where(eq(customer.id, id)).returning();
  if (!row) return jsonError(c, 404, 'NOT_FOUND', 'Customer not found');
  return c.json({ ok: true });
});

export const fetch = (req: Request) => app.fetch(req);
export default handle(app);
