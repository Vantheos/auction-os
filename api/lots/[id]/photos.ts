// api/lots/[id]/photos.ts
// GET — list photos for a lot, with signed read URLs (1568 px transform).
// POST — append a subsequent photo (lot row already exists). Creates a
//   `lot_photo` row in `pending` and returns a signed upload URL for the
//   browser to PUT to. First-photo creation is handled by POST /api/lots
//   (atomic with lot insert) when the request body includes `firstPhoto`.

import type { IncomingMessage, ServerResponse } from 'node:http';
import { z } from 'zod';
import { count, eq, asc } from 'drizzle-orm';
import { AuthError, requireAuth } from '../../_lib/auth.js';
import { readJson, EmptyBodyError } from '../../_lib/body.js';
import { asActor, getDb } from '../../_lib/db.js';
import { jsonError, jsonOk, methodNotAllowed } from '../../_lib/responses.js';
import { signUploadUrl, bulkSignReadUrls } from '../../_lib/storage.js';
import { lotPhoto, lot } from '../../../db/schema.js';

const MAX_PHOTOS = 12;
const PostSchema = z.object({
  // displayOrder is informational; server enforces (existing count + 1) anyway.
  displayOrder: z.number().int().positive().max(MAX_PHOTOS).optional(),
});

function getId(req: IncomingMessage): string | null {
  const url = new URL(req.url ?? '', 'http://localhost');
  return url.searchParams.get('id') ?? null;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    const id = getId(req);
    if (!id) return jsonError(res, 400, 'INVALID_REQUEST', 'Missing lot id');

    if (req.method === 'GET') {
      await requireAuth(req);
      const rows = await getDb().select().from(lotPhoto)
        .where(eq(lotPhoto.lotId, id))
        .orderBy(asc(lotPhoto.displayOrder));

      // Sign read URLs only for photos that have actually uploaded; pending/failed
      // entries don't have a real Storage object yet (or have a failed one) so
      // signing them would point at a 404.
      const uploaded = rows.filter((r) => r.status === 'uploaded');
      const signed = await bulkSignReadUrls(
        uploaded.map((r) => r.storagePath),
        { width: 1568, quality: 80 }
      );
      const photos = rows.map((r) => ({
        ...r,
        signedUrl: r.status === 'uploaded' ? signed.get(r.storagePath) ?? null : null,
      }));
      return jsonOk(res, { photos });
    }

    if (req.method === 'POST') {
      const { userId } = await requireAuth(req, 'admin', 'office', 'warehouse');

      let body: unknown;
      try { body = await readJson(req); }
      catch (e) {
        if (e instanceof EmptyBodyError) return jsonError(res, 400, 'INVALID_BODY', 'Empty body');
        return jsonError(res, 400, 'INVALID_BODY', 'Invalid JSON');
      }
      const parsed = PostSchema.safeParse(body ?? {});
      if (!parsed.success) return jsonError(res, 400, 'INVALID_BODY', parsed.error.issues[0].message);

      // Verify lot exists; reject if not (don't surface a confusing FK error)
      const [parent] = await getDb().select({ id: lot.id }).from(lot).where(eq(lot.id, id));
      if (!parent) return jsonError(res, 404, 'NOT_FOUND', 'Lot not found');

      const created = await asActor(userId, async (tx) => {
        const [{ n }] = await tx.select({ n: count() }).from(lotPhoto).where(eq(lotPhoto.lotId, id));
        if (n >= MAX_PHOTOS) {
          throw new Error('MAX_PHOTOS');
        }
        const nextOrder = n + 1;
        const photoId = crypto.randomUUID();
        const storagePath = `lots/${id}/${photoId}.jpg`;
        const [row] = await tx.insert(lotPhoto).values({
          id: photoId,
          lotId: id,
          storagePath,
          displayOrder: nextOrder,
          status: 'pending',
          capturedBy: userId,
        }).returning();
        return row;
      });

      const { uploadUrl, token } = await signUploadUrl(created.storagePath);
      return jsonOk(res, { ...created, uploadUrl, token }, 201);
    }

    return methodNotAllowed(res);
  } catch (err) {
    if (err instanceof AuthError) return jsonError(res, err.status, err.code, err.message);
    if (err instanceof Error && err.message === 'MAX_PHOTOS') {
      return jsonError(res, 422, 'MAX_PHOTOS', `A lot may have at most ${MAX_PHOTOS} photos`);
    }
    console.error(err);
    return jsonError(res, 500, 'INTERNAL', 'Internal server error');
  }
}
