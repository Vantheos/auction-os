import type { IncomingMessage, ServerResponse } from 'node:http';
import { eq, asc } from 'drizzle-orm';
import { AuthError, requireAuth } from '../../_lib/auth.js';
import { getDb } from '../../_lib/db.js';
import { jsonError, jsonOk, methodNotAllowed } from '../../_lib/responses.js';
import { lotPhoto } from '../../../db/schema.js';

function getId(req: IncomingMessage): string | null {
  const url = new URL(req.url ?? '', 'http://localhost');
  return url.searchParams.get('id') ?? null;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    if (req.method !== 'GET') return methodNotAllowed(res);
    await requireAuth(req);
    const id = getId(req);
    if (!id) return jsonError(res, 400, 'INVALID_REQUEST', 'Missing lot id');
    const photos = await getDb().select().from(lotPhoto)
      .where(eq(lotPhoto.lotId, id))
      .orderBy(asc(lotPhoto.displayOrder));
    return jsonOk(res, { photos });
  } catch (err) {
    if (err instanceof AuthError) return jsonError(res, err.status, err.code, err.message);
    console.error(err);
    return jsonError(res, 500, 'INTERNAL', 'Internal server error');
  }
}
