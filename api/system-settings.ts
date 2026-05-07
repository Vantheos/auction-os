// api/system-settings.ts
import type { IncomingMessage, ServerResponse } from 'node:http';
import { z } from 'zod';
import { eq, sql } from 'drizzle-orm';
import { AuthError, requireAuth } from './_lib/auth.js';
import { readJson, EmptyBodyError } from './_lib/body.js';
import { asActor, getDb } from './_lib/db.js';
import { jsonError, jsonOk, methodNotAllowed } from './_lib/responses.js';
import { systemSettings } from '../db/schema.js';

const PatchSchema = z.object({
  labelPrinterHelperUrl: z.string().url().nullable().optional(),
  aiScheduleEnabled: z.boolean().optional(),
  // Positive integer hours; UI restricts to 4 / 8 / 12 / 24, server accepts
  // any positive value so future intervals don't need a migration. Floor of
  // 1 hour because anything tighter is "real-time" territory (Phase 6 spec).
  aiScheduleIntervalHours: z.number().int().min(1).optional(),
  // Postgres TIME format. Native <input type="time"> emits HH:MM; the seconds
  // suffix is optional and mostly cosmetic.
  aiScheduleTimeOfDay: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional(),
}).strict();

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    if (req.method === 'GET') {
      await requireAuth(req);
      const db = getDb();
      const [row] = await db.select().from(systemSettings).where(eq(systemSettings.id, 1));
      if (!row) return jsonError(res, 404, 'NOT_FOUND', 'system_settings singleton missing');
      // Mirrors the eligibility filter in /api/ai/backlog so the badge shows
      // exactly what AI will pick up next: status NULL, eligible state,
      // AND at least one of title / description / price still empty (a
      // fully operator-completed lot is intentionally excluded — AI won't
      // run on it and shouldn't show as pending).
      const [{ pending }] = await db.execute<{ pending: number }>(sql`
        SELECT COUNT(*)::int AS pending
          FROM lot
         WHERE last_ai_run_status IS NULL
           AND state IN ('assigned', 'unassigned')
           AND (title IS NULL OR title = ''
                OR description IS NULL OR description = ''
                OR price IS NULL)
      `);
      return jsonOk(res, { ...row, aiPendingLotCount: pending });
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
