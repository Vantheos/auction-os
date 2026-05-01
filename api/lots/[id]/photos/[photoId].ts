// api/lots/[id]/photos/[photoId].ts
// PATCH: flip status (pending → uploaded | failed). Used by the client after
// the browser PUT to the signed upload URL completes (or fails terminally).
// DELETE: remove the photo row + storage object. If the deleted photo was the
// cover (display_order = 1), promote the next photo to cover by re-shuffling.

import type { IncomingMessage, ServerResponse } from 'node:http';
import { z } from 'zod';
import { and, asc, eq, gt, sql } from 'drizzle-orm';
import { AuthError, requireAuth } from '../../../_lib/auth.js';
import { readJson, EmptyBodyError } from '../../../_lib/body.js';
import { asActor, getDb } from '../../../_lib/db.js';
import { jsonError, jsonOk, methodNotAllowed } from '../../../_lib/responses.js';
import { removeObjects } from '../../../_lib/storage.js';
import { lotPhoto } from '../../../../db/schema.js';

const PatchSchema = z.object({
  status: z.enum(['uploaded', 'failed']),
});

function getIds(req: IncomingMessage): { lotId: string | null; photoId: string | null } {
  const url = new URL(req.url ?? '', 'http://localhost');
  const lotId = url.searchParams.get('id');
  const photoId = url.searchParams.get('photoId');
  if (lotId && photoId) return { lotId, photoId };
  // Fallback: parse from pathname /api/lots/<lotId>/photos/<photoId>
  const segs = url.pathname.split('/').filter(Boolean);
  if (segs.length >= 5 && segs[1] === 'lots' && segs[3] === 'photos') {
    return { lotId: segs[2], photoId: segs[4] };
  }
  return { lotId, photoId };
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    const { lotId, photoId } = getIds(req);
    if (!lotId || !photoId) {
      return jsonError(res, 400, 'INVALID_REQUEST', 'Missing lot id or photo id');
    }

    if (req.method === 'PATCH') {
      const { userId } = await requireAuth(req, 'admin', 'office', 'warehouse');

      let body: unknown;
      try { body = await readJson(req); }
      catch (e) {
        if (e instanceof EmptyBodyError) return jsonError(res, 400, 'INVALID_BODY', 'Empty body');
        return jsonError(res, 400, 'INVALID_BODY', 'Invalid JSON');
      }
      const parsed = PatchSchema.safeParse(body);
      if (!parsed.success) return jsonError(res, 400, 'INVALID_BODY', parsed.error.issues[0].message);

      const updated = await asActor(userId, async (tx) => {
        const [current] = await tx.select().from(lotPhoto).where(eq(lotPhoto.id, photoId));
        if (!current) return null;
        if (current.lotId !== lotId) {
          throw new Error('LOT_PHOTO_MISMATCH');
        }
        // Only allow forward transitions from pending. Idempotent if already in target state.
        if (current.status !== 'pending' && current.status !== parsed.data.status) {
          throw new Error('STATUS_TRANSITION_INVALID');
        }
        if (current.status === parsed.data.status) {
          return current;
        }
        const [row] = await tx.update(lotPhoto)
          .set({ status: parsed.data.status })
          .where(eq(lotPhoto.id, photoId))
          .returning();
        return row;
      });

      if (!updated) return jsonError(res, 404, 'NOT_FOUND', 'Photo not found');
      return jsonOk(res, updated);
    }

    if (req.method === 'DELETE') {
      const { userId } = await requireAuth(req, 'admin', 'office', 'warehouse');

      // Fetch first so we know the storage path + display_order
      const [current] = await getDb().select().from(lotPhoto).where(eq(lotPhoto.id, photoId));
      if (!current) return jsonError(res, 404, 'NOT_FOUND', 'Photo not found');
      if (current.lotId !== lotId) {
        return jsonError(res, 400, 'LOT_PHOTO_MISMATCH', 'Photo does not belong to that lot');
      }

      await asActor(userId, async (tx) => {
        // Delete the row
        await tx.delete(lotPhoto).where(eq(lotPhoto.id, photoId));
        // Re-shuffle subsequent photos down by 1 to keep display_order contiguous.
        // This makes whoever was at slot 2 the new cover (slot 1) automatically.
        await tx.update(lotPhoto)
          .set({ displayOrder: sql`${lotPhoto.displayOrder} - 1` })
          .where(and(eq(lotPhoto.lotId, lotId), gt(lotPhoto.displayOrder, current.displayOrder)));
      });

      // Best-effort storage object removal (logged on failure; not fatal)
      await removeObjects([current.storagePath]);

      // Return the new ordered list so the client can update its local view
      const remaining = await getDb().select()
        .from(lotPhoto)
        .where(eq(lotPhoto.lotId, lotId))
        .orderBy(asc(lotPhoto.displayOrder));
      return jsonOk(res, { ok: true, remaining });
    }

    return methodNotAllowed(res);
  } catch (err) {
    if (err instanceof AuthError) return jsonError(res, err.status, err.code, err.message);
    if (err instanceof Error && err.message === 'LOT_PHOTO_MISMATCH') {
      return jsonError(res, 400, 'LOT_PHOTO_MISMATCH', 'Photo does not belong to that lot');
    }
    if (err instanceof Error && err.message === 'STATUS_TRANSITION_INVALID') {
      return jsonError(res, 422, 'STATUS_TRANSITION_INVALID', 'Photo status cannot transition that way');
    }
    console.error(err);
    return jsonError(res, 500, 'INTERNAL', 'Internal server error');
  }
}
