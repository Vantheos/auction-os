import { handle } from '@hono/node-server/vercel';
// api/users/index.ts
import { z } from 'zod';
import { createApp } from '../_app.js';
import { authMiddleware, requireRole } from '../_middleware/auth.js';
import { getDb } from '../_lib/db.js';
import { appUser } from '../../db/schema.js';
import { jsonError } from '../_lib/responses.js';
import { createClient } from '@supabase/supabase-js';

const app = createApp();
app.use('/api/users', authMiddleware);

const CreateSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(['admin', 'office', 'warehouse']),
  displayName: z.string().min(1).max(200),
});

app.get('/api/users', requireRole('admin'), async (c) => {
  const db = getDb();
  const rows = await db.select().from(appUser).orderBy(appUser.createdAt);
  return c.json({ users: rows });
});

app.post('/api/users', requireRole('admin'), async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return jsonError(c, 400, 'INVALID_BODY', parsed.error.issues[0].message);

  const supabaseUrl = process.env.SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const admin = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  const { data, error } = await admin.auth.admin.createUser({
    email: parsed.data.email,
    password: parsed.data.password,
    email_confirm: true,
  });
  if (error || !data.user) return jsonError(c, 400, 'AUTH_CREATE_FAILED', error?.message ?? 'Failed to create user');

  const db = getDb();
  const [row] = await db.insert(appUser).values({
    id: data.user.id,
    role: parsed.data.role,
    displayName: parsed.data.displayName,
  }).returning();
  return c.json(row, 201);
});

export const fetch = (req: Request) => app.fetch(req);
export default handle(app);
