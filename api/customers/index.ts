// api/customers/index.ts
import { handle } from 'hono/vercel';
import { z } from 'zod';
import { createApp } from '../_app';
import { authMiddleware, requireRole } from '../_middleware/auth';
import { getDb } from '../_lib/db';
import { customer } from '../../db/schema';
import { jsonError } from '../_lib/responses';

const app = createApp();
app.use('/api/customers/*', authMiddleware);
app.use('/api/customers', authMiddleware);

const CreateSchema = z.object({ name: z.string().min(1).max(200) });

app.get('/api/customers', async (c) => {
  const db = getDb();
  const rows = await db.select().from(customer).orderBy(customer.createdAt);
  return c.json({ customers: rows });
});

app.post('/api/customers', requireRole('admin', 'office'), async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(c, 400, 'INVALID_BODY', parsed.error.issues[0].message);
  }
  const db = getDb();
  const [row] = await db.insert(customer).values({ name: parsed.data.name }).returning();
  return c.json(row, 201);
});

const handler = handle(app);
export default handler;
export const config = { runtime: 'nodejs' };
