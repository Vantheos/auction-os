// api/users/[id].ts
import type { IncomingMessage, ServerResponse } from 'node:http';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { AuthError, requireAuth } from '../_lib/auth.js';
import { readJson, EmptyBodyError } from '../_lib/body.js';
import { asActor } from '../_lib/db.js';
import { jsonError, jsonOk, methodNotAllowed } from '../_lib/responses.js';
import { appUser } from '../../db/schema.js';

const PatchSchema = z.object({
  role: z.enum(['admin', 'office', 'warehouse']).optional(),
  displayName: z.string().min(1).max(200).optional(),
  disabled: z.boolean().optional(),
});

function getId(req: IncomingMessage): string | null {
  const url = new URL(req.url ?? '', 'http://localhost');
  const fromQuery = url.searchParams.get('id');
  if (fromQuery) return fromQuery;
  const segments = url.pathname.split('/').filter(Boolean);
  return segments[segments.length - 1] || null;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    const id = getId(req);
    if (!id) return jsonError(res, 400, 'INVALID_REQUEST', 'Missing user id');

    if (req.method === 'PATCH') {
      const { userId } = await requireAuth(req, 'admin');
      let body: unknown;
      try {
        body = await readJson(req);
      } catch (e) {
        if (e instanceof EmptyBodyError) return jsonError(res, 400, 'INVALID_BODY', 'Empty body');
        return jsonError(res, 400, 'INVALID_BODY', 'Invalid JSON');
      }
      const parsed = PatchSchema.safeParse(body);
      if (!parsed.success) return jsonError(res, 400, 'INVALID_BODY', parsed.error.issues[0].message);

      const update: Record<string, unknown> = { updatedAt: new Date() };
      if (parsed.data.role !== undefined) update.role = parsed.data.role;
      if (parsed.data.displayName !== undefined) update.displayName = parsed.data.displayName;
      if (parsed.data.disabled !== undefined) {
        update.disabledAt = parsed.data.disabled ? new Date() : null;
      }

      const row = await asActor(userId, async (tx) => {
        const [r] = await tx.update(appUser).set(update).where(eq(appUser.id, id)).returning();
        return r;
      });
      if (!row) return jsonError(res, 404, 'NOT_FOUND', 'User not found');
      return jsonOk(res, row);
    }

    return methodNotAllowed(res);
  } catch (err) {
    if (err instanceof AuthError) return jsonError(res, err.status, err.code, err.message);
    console.error(err);
    return jsonError(res, 500, 'INTERNAL', 'Internal server error');
  }
}
