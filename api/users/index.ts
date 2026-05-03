// api/users/index.ts
import type { IncomingMessage, ServerResponse } from 'node:http';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import { AuthError, requireAuth } from '../_lib/auth.js';
import { readJson, EmptyBodyError } from '../_lib/body.js';
import { asActor, getDb } from '../_lib/db.js';
import { jsonError, jsonOk, methodNotAllowed } from '../_lib/responses.js';
import { appUser } from '../../db/schema.js';

const CreateSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(['admin', 'office', 'warehouse']),
  displayName: z.string().min(1).max(200),
});

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    if (req.method === 'GET') {
      await requireAuth(req, 'admin');
      const rows = await getDb().select().from(appUser).orderBy(appUser.createdAt);

      // Enrich with email from auth.users via the admin client. Email lives
      // in auth.users, not app_user; fetching all and building a map is
      // cheap at this scale (sub-100 users) and avoids per-row admin calls.
      const supabaseUrl = process.env.SUPABASE_URL;
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!supabaseUrl || !serviceKey) {
        return jsonError(res, 500, 'INTERNAL', 'Supabase admin credentials not configured');
      }
      const admin = createClient(supabaseUrl, serviceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
      if (error) {
        console.error('Failed to fetch auth users for email enrichment:', error);
        return jsonError(res, 500, 'INTERNAL', 'Failed to fetch user emails');
      }
      const emailById = new Map(data.users.map((u) => [u.id, u.email ?? null]));
      const enriched = rows.map((r) => ({ ...r, email: emailById.get(r.id) ?? null }));
      return jsonOk(res, { users: enriched });
    }

    if (req.method === 'POST') {
      const { userId } = await requireAuth(req, 'admin');
      let body: unknown;
      try {
        body = await readJson(req);
      } catch (e) {
        if (e instanceof EmptyBodyError) return jsonError(res, 400, 'INVALID_BODY', 'Empty body');
        return jsonError(res, 400, 'INVALID_BODY', 'Invalid JSON');
      }
      const parsed = CreateSchema.safeParse(body);
      if (!parsed.success) return jsonError(res, 400, 'INVALID_BODY', parsed.error.issues[0].message);

      const supabaseUrl = process.env.SUPABASE_URL;
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!supabaseUrl || !serviceKey) {
        return jsonError(res, 500, 'INTERNAL', 'Supabase admin credentials not configured');
      }
      const admin = createClient(supabaseUrl, serviceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });

      const { data, error } = await admin.auth.admin.createUser({
        email: parsed.data.email,
        password: parsed.data.password,
        email_confirm: true,
      });
      if (error || !data.user) {
        return jsonError(res, 400, 'AUTH_CREATE_FAILED', error?.message ?? 'Failed to create user');
      }

      const row = await asActor(userId, async (tx) => {
        const [r] = await tx
          .insert(appUser)
          .values({
            id: data.user!.id,
            role: parsed.data.role,
            displayName: parsed.data.displayName,
          })
          .returning();
        return r;
      });
      return jsonOk(res, row, 201);
    }

    return methodNotAllowed(res);
  } catch (err) {
    if (err instanceof AuthError) return jsonError(res, err.status, err.code, err.message);
    console.error(err);
    return jsonError(res, 500, 'INTERNAL', 'Internal server error');
  }
}
