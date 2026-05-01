// api/system-settings.ts
import type { IncomingMessage, ServerResponse } from 'node:http';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { AuthError, requireAuth } from './_lib/auth.js';
import { readJson, EmptyBodyError } from './_lib/body.js';
import { asActor, getDb } from './_lib/db.js';
import { jsonError, jsonOk, methodNotAllowed } from './_lib/responses.js';
import { systemSettings } from '../db/schema.js';

const PatchSchema = z.object({
  labelPrinterHelperUrl: z.string().url().nullable().optional(),
}).strict();

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    if (req.method === 'GET') {
      await requireAuth(req);
      const [row] = await getDb().select().from(systemSettings).where(eq(systemSettings.id, 1));
      if (!row) return jsonError(res, 404, 'NOT_FOUND', 'system_settings singleton missing');
      return jsonOk(res, row);
    }

    if (req.method === 'PATCH') {
      const { userId } = await requireAuth(req, 'admin');
      let body: unknown;
      try { body = await readJson(req); }
      catch (e) {
        if (e instanceof EmptyBodyError) return jsonError(res, 400, 'INVALID_BODY', 'Empty body');
        return jsonError(res, 400, 'INVALID_BODY', 'Invalid JSON');
      }
      const parsed = PatchSchema.safeParse(body);
      if (!parsed.success) return jsonError(res, 400, 'INVALID_BODY', parsed.error.issues[0].message);

      const updated = await asActor(userId, async (tx) => {
        const [row] = await tx.update(systemSettings)
          .set({ ...parsed.data, updatedAt: new Date() })
          .where(eq(systemSettings.id, 1))
          .returning();
        return row;
      });
      return jsonOk(res, updated);
    }

    return methodNotAllowed(res);
  } catch (err) {
    if (err instanceof AuthError) return jsonError(res, err.status, err.code, err.message);
    console.error(err);
    return jsonError(res, 500, 'INTERNAL', 'Internal server error');
  }
}
