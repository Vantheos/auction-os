// api/cron/cleanup-export-blobs.ts
// Phase 5 Area 5 — daily cron that removes Vercel Blob objects under the
// `exports/` prefix older than 24h. Pairs with the AF360 export pipeline:
// each /batch endpoint invocation uploads a zip to `exports/{jobId}/...zip`
// with `addRandomSuffix: false`. Re-export of the same job overwrites prior
// objects, but jobs that aren't re-exported leave behind their last zip
// indefinitely without this sweep.
//
// Auth: requireCronAuth (Bearer ${CRON_SECRET}). Mirrors cleanup-orphan-lots.

import type { IncomingMessage, ServerResponse } from 'node:http';
import { list, del } from '@vercel/blob';
import { AuthError } from '../_lib/auth.js';
import { requireCronAuth } from '../_lib/cron-auth.js';
import { jsonError, jsonOk, methodNotAllowed } from '../_lib/responses.js';

const PREFIX = 'exports/';
const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    if (req.method !== 'POST' && req.method !== 'GET') return methodNotAllowed(res);
    requireCronAuth(req);

    const token = process.env.BLOB_READ_WRITE_TOKEN;
    const cutoff = Date.now() - TTL_MS;

    let cursor: string | undefined;
    let scanned = 0;
    let deleted = 0;
    let errors = 0;

    // Vercel Blob list paginates; loop until no cursor returned.
    for (;;) {
      const { blobs, cursor: nextCursor } = await list({
        prefix: PREFIX,
        cursor,
        limit: 1000,
        token,
      });
      scanned += blobs.length;

      const stale = blobs.filter((b) => b.uploadedAt.getTime() < cutoff);
      // Delete in parallel; failures logged but don't stop the sweep.
      const results = await Promise.allSettled(
        stale.map((b) => del(b.url, { token })),
      );
      for (const r of results) {
        if (r.status === 'fulfilled') deleted++;
        else {
          errors++;
          console.error('cleanup-export-blobs: delete failed', r.reason);
        }
      }

      if (!nextCursor) break;
      cursor = nextCursor;
    }

    return jsonOk(res, { scanned, deleted, errors });
  } catch (err) {
    if (err instanceof AuthError) return jsonError(res, err.status, err.code, err.message);
    console.error(err);
    return jsonError(res, 500, 'INTERNAL', 'Internal server error');
  }
}
