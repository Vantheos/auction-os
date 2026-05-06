// api/ai/run.ts
// POST /api/ai/run — manual single-lot AI generation trigger.
// Body: { lotId: string }
// Auth: admin or office (warehouse cannot trigger AI per v1 §2 matrix).
// Rejects: 422 LOT_NOT_ELIGIBLE if status non-null or wrong state;
//          423 LOT_AI_IN_PROGRESS if processing lock active.

import type { IncomingMessage, ServerResponse } from 'node:http';
import { z } from 'zod';
import { eq, sql, and } from 'drizzle-orm';
import { AuthError, requireAuth } from '../_lib/auth.js';
import { readJson, EmptyBodyError } from '../_lib/body.js';
import { getDb } from '../_lib/db.js';
import { jsonError, jsonOk, methodNotAllowed } from '../_lib/responses.js';
import { bulkSignReadUrls } from '../_lib/storage.js';
import { finalizeLotRun } from '../_lib/ai-finalize.js';
import { PER_LOT_STALE_THRESHOLD_SQL } from '../_lib/ai-thresholds.js';
import { lot, lotPhoto } from '../../db/schema.js';
import { runAiForLot, tryExtractUsageFromError } from '../../src/lib/ai/anthropic.js';
import { computeCostCents } from '../../src/lib/ai/model.js';
import {
  composeTitle, composeDescription, determineFieldStatus, mapStatus, buildErrorString,
} from '../../src/lib/ai/compose.js';

const Body = z.object({ lotId: z.string().uuid() });

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    if (req.method !== 'POST') return methodNotAllowed(res);
    const { userId } = await requireAuth(req, 'admin', 'office');

    let body: unknown;
    try { body = await readJson(req); }
    catch (e) {
      if (e instanceof EmptyBodyError) return jsonError(res, 400, 'INVALID_BODY', 'Empty body');
      return jsonError(res, 400, 'INVALID_BODY', 'Invalid JSON');
    }
    const parsed = Body.safeParse(body);
    if (!parsed.success) return jsonError(res, 400, 'INVALID_BODY', parsed.error.issues[0].message);

    const db = getDb();
    const [current] = await db.select().from(lot).where(eq(lot.id, parsed.data.lotId));
    if (!current) return jsonError(res, 404, 'NOT_FOUND', 'Lot not found');

    if (current.lastAiRunStatus !== null) {
      return jsonError(res, 422, 'LOT_NOT_ELIGIBLE', 'Lot has already been processed by AI');
    }
    if (current.state !== 'assigned' && current.state !== 'unassigned') {
      return jsonError(res, 422, 'LOT_NOT_ELIGIBLE', `Lot in state "${current.state}" cannot be processed`);
    }

    // Per-lot atomic claim
    const claimed = await db.execute<{ id: string }>(sql`
      UPDATE lot SET ai_processing_started_at = NOW()
       WHERE id = ${parsed.data.lotId}
         AND (ai_processing_started_at IS NULL
              OR ai_processing_started_at < NOW() - ${PER_LOT_STALE_THRESHOLD_SQL})
       RETURNING id
    `);
    if (claimed.length === 0) {
      return jsonError(res, 423, 'LOT_AI_IN_PROGRESS', 'AI is currently generating content for this lot');
    }

    try {
      // Sign photo URLs (1568 px, contain)
      const photos = await db.select({ path: lotPhoto.storagePath })
        .from(lotPhoto)
        .where(and(eq(lotPhoto.lotId, parsed.data.lotId), eq(lotPhoto.status, 'uploaded')));
      const signed = await bulkSignReadUrls(
        photos.map((p) => p.path),
        { width: 1568, quality: 80, resize: 'contain' },
      );
      const photoUrls = photos.map((p) => signed.get(p.path)).filter((u): u is string => !!u);

      const result = await runAiForLot({
        photoUrls,
        operatorFields: {
          quantity: current.quantity,
          specialNotesCategory: current.specialNotesCategory,
          specialNotesText: current.specialNotesText,
          untested: current.untested,
          ref1: current.ref1,
          ref2: current.ref2,
        },
      });

      const fieldStatuses = determineFieldStatus({
        brand: result.output.brand,
        briefDescription: result.output.brief_description,
        descriptionBody: result.output.description_body,
        price: result.output.price,
      });

      const fresh = await finalizeLotRun(parsed.data.lotId, userId, {
        title: composeTitle({
          brand: result.output.brand,
          briefDescription: result.output.brief_description,
          price: result.output.price,
          quantity: current.quantity,
          specialNotesCategory: current.specialNotesCategory,
        }),
        description: composeDescription({
          body: result.output.description_body,
          specialNotesCategory: current.specialNotesCategory,
          specialNotesText: current.specialNotesText,
          untested: current.untested,
        }),
        price: result.output.price !== null ? result.output.price.toFixed(2) : null,
        lastAiRunStatus: mapStatus(fieldStatuses),
        lastAiRunError: buildErrorString(fieldStatuses),
      }, result.costCents);

      return jsonOk(res, fresh);
    } catch (err) {
      // Failure path — record as 'failure' status and clear processing lock
      const usage = tryExtractUsageFromError(err);
      const costCents = computeCostCents(usage.inputTokens, usage.outputTokens);
      const errorMsg = err instanceof Error ? err.message.slice(0, 500) : 'Unknown AI error';

      // Failure path omits title/description/price so we don't clobber
      // any operator-entered values that may have existed before the run.
      const fresh = await finalizeLotRun(parsed.data.lotId, userId, {
        lastAiRunStatus: 'failure',
        lastAiRunError: errorMsg,
      }, costCents);

      return jsonOk(res, fresh);
    }
  } catch (err) {
    if (err instanceof AuthError) return jsonError(res, err.status, err.code, err.message);
    console.error(err);
    return jsonError(res, 500, 'INTERNAL', 'Internal server error');
  }
}
