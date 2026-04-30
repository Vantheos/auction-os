import { handle } from '@hono/node-server/vercel';
// api/jobs/index.ts
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { createApp } from '../_app';
import { authMiddleware, requireRole } from '../_middleware/auth';
import { getDb } from '../_lib/db';
import { job } from '../../db/schema';
import { jsonError } from '../_lib/responses';

const app = createApp();
app.use('/api/jobs', authMiddleware);

const CreateSchema = z.object({
  customerId: z.string().uuid(),
  jobNumber: z.string().min(1).max(200),
});

app.get('/api/jobs', async (c) => {
  const customerId = c.req.query('customerId');
  const db = getDb();
  const rows = customerId
    ? await db.select().from(job).where(eq(job.customerId, customerId))
    : await db.select().from(job);
  return c.json({ jobs: rows });
});

app.post('/api/jobs', requireRole('admin', 'office'), async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return jsonError(c, 400, 'INVALID_BODY', parsed.error.issues[0].message);

  const db = getDb();
  try {
    const [row] = await db.insert(job).values(parsed.data).returning();
    return c.json(row, 201);
  } catch (err: any) {
    // DrizzleQueryError wraps the postgres error in .cause; plain postgres-js puts it directly on err
    const pgCode = err.code ?? err.cause?.code;
    if (pgCode === '23505') return jsonError(c, 409, 'DUPLICATE_JOB_NUMBER', 'A job with that number already exists for this customer');
    throw err;
  }
});

export const fetch = (req: Request) => app.fetch(req);
export default handle(app);
