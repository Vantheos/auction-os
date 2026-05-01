// api/cron/cleanup-orphan-lots.ts
// Runs every 15 minutes via Vercel cron. Sweeps lots that look abandoned:
//   - state IN ('assigned', 'unassigned')
//   - zero lot_photo rows
//   - created_at < now() - interval '30 minutes'
// These can only come from cataloging sessions where the operator opened a
// lot row but never captured a first photo (e.g., tab close before camera).
// A real cataloged lot has at least 1 photo per spec §6.1.

import type { IncomingMessage, ServerResponse } from 'node:http';
import { sql } from 'drizzle-orm';
import { AuthError } from '../_lib/auth.js';
import { requireCronAuth } from '../_lib/cron-auth.js';
import { getDb } from '../_lib/db.js';
import { jsonError, jsonOk, methodNotAllowed } from '../_lib/responses.js';
import { listLotObjects, removeObjects } from '../_lib/storage.js';

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    if (req.method !== 'POST' && req.method !== 'GET') return methodNotAllowed(res);
    requireCronAuth(req);

    const db = getDb();
    const orphans = await db.execute<{ id: string }>(sql`
      SELECT id FROM lot
      WHERE state IN ('assigned', 'unassigned')
        AND created_at < NOW() - INTERVAL '30 minutes'
        AND NOT EXISTS (SELECT 1 FROM lot_photo WHERE lot_id = lot.id)
    `);

    let deleted = 0;
    let errors = 0;
    for (const row of orphans) {
      try {
        // Defense in depth: list and remove any storage objects under the lot
        // prefix (typically empty for true orphans by definition).
        const objs = await listLotObjects(row.id);
        if (objs.length > 0) {
          await removeObjects(objs);
        }
        // Direct DB delete (no asActor — this is system-driven, not user-driven;
        // audit trail will record changed_by = NULL which is correct for cron).
        await db.execute(sql`DELETE FROM lot WHERE id = ${row.id}`);
        deleted++;
      } catch (err) {
        console.error(`cleanup-orphan-lots: failed to delete ${row.id}: ${String(err)}`);
        errors++;
      }
    }

    return jsonOk(res, { deleted, errors, candidates: orphans.length });
  } catch (err) {
    if (err instanceof AuthError) return jsonError(res, err.status, err.code, err.message);
    console.error(err);
    return jsonError(res, 500, 'INTERNAL', 'Internal server error');
  }
}
