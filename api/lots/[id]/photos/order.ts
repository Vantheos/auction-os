// api/lots/[id]/photos/order.ts
// PATCH: rewrite display_order for all photos of a lot in one transaction.
// Body: { order: photoId[] } — full ordered list. Validates that the array
// contains exactly the photos belonging to this lot (no missing, no extras).

import type { IncomingMessage, ServerResponse } from 'node:http';
import { z } from 'zod';
import { asc, eq } from 'drizzle-orm';
import { AuthError, requireAuth } from '../../../_lib/auth.js';
import { readJson, EmptyBodyError } from '../../../_lib/body.js';
import { asActor } from '../../../_lib/db.js';
import { jsonError, jsonOk, methodNotAllowed } from '../../../_lib/responses.js';
import { lotPhoto } from '../../../../db/schema.js';

const Schema = z.object({
  order: z.array(z.string().uuid()).min(1).max(12),
});

function getLotId(req: IncomingMessage): string | null {
  const url = new URL(req.url ?? '', 'http://localhost');
  const fromQuery = url.searchParams.get('id');
  if (fromQuery) return fromQuery;
  const segs = url.pathname.split('/').filter(Boolean);
  // /api/lots/<id>/photos/order → segs = ['api', 'lots', '<id>', 'photos', 'order']
  return segs.length >= 5 && segs[1] === 'lots' && segs[3] === 'photos' ? segs[2] : null;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    if (req.method !== 'PATCH') return methodNotAllowed(res);

    const { userId } = await requireAuth(req, 'admin', 'office', 'warehouse');

    const lotId = getLotId(req);
    if (!lotId) return jsonError(res, 400, 'INVALID_REQUEST', 'Missing lot id');

    let body: unknown;
    try { body = await readJson(req); }
    catch (e) {
      if (e instanceof EmptyBodyError) return jsonError(res, 400, 'INVALID_BODY', 'Empty body');
      return jsonError(res, 400, 'INVALID_BODY', 'Invalid JSON');
    }
    const parsed = Schema.safeParse(body);
    if (!parsed.success) return jsonError(res, 400, 'INVALID_BODY', parsed.error.issues[0].message);

    const updated = await asActor(userId, async (tx) => {
      const existing = await tx.select({ id: lotPhoto.id })
        .from(lotPhoto)
        .where(eq(lotPhoto.lotId, lotId));
      const existingIds = new Set(existing.map((r) => r.id));
      const requestedIds = new Set(parsed.data.order);

      // Validate: requested set must equal existing set exactly
      if (existingIds.size !== requestedIds.size) {
        throw new Error('ORDER_MISMATCH');
      }
      for (const id of existingIds) {
        if (!requestedIds.has(id)) throw new Error('ORDER_MISMATCH');
      }

      // Build a single CASE-WHEN UPDATE rewriting every photo's display_order.
      // Drizzle's preferred form for this is per-row updates inside the tx;
      // for 1-12 rows the round-trip cost is negligible and clearer than a
      // hand-rolled CASE expression.
      for (let i = 0; i < parsed.data.order.length; i++) {
        await tx.update(lotPhoto)
          .set({ displayOrder: i + 1 })
          .where(eq(lotPhoto.id, parsed.data.order[i]));
      }

      return await tx.select()
        .from(lotPhoto)
        .where(eq(lotPhoto.lotId, lotId))
        .orderBy(asc(lotPhoto.displayOrder));
    });

    return jsonOk(res, { ok: true, photos: updated });
  } catch (err) {
    if (err instanceof AuthError) return jsonError(res, err.status, err.code, err.message);
    if (err instanceof Error && err.message === 'ORDER_MISMATCH') {
      return jsonError(res, 422, 'ORDER_MISMATCH', 'Order array must contain exactly the lot\'s photo ids');
    }
    console.error(err);
    return jsonError(res, 500, 'INTERNAL', 'Internal server error');
  }
}
