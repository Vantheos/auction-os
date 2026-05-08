// api/lots/[id]/ai-reset.ts
// POST /api/lots/[id]/ai-reset — clears the lot's AI status so it
// becomes eligible for AI processing again. Companion to the bulk
// 'reset-ai' action in /api/lots/bulk; provides a thin per-lot path
// for the lot detail "Reset AI" button.
//
// Recovery action for any infrastructure-class AI failure (Anthropic
// outage, transient network issue, SDK regression, etc.) where the
// lot got stuck at 'failure' status with no usable output. Allowed
// for any non-NULL status — status-aware finalize already prevents
// re-runs from clobbering operator-entered fields, so a re-run on
// 'success' is safe but explicit.
//
// Refused with 409 LOT_AI_IN_PROGRESS when the per-lot lock is still
// fresh (<5 min) — that means an AI call is currently in flight and
// clearing the lock would race the eventual finalize write.

import type { IncomingMessage, ServerResponse } from 'node:http';
import { eq } from 'drizzle-orm';
import { AuthError, requireAuth } from '../../_lib/auth.js';
import { asActor } from '../../_lib/db.js';
import { jsonError, jsonOk, methodNotAllowed } from '../../_lib/responses.js';
import { lot } from '../../../db/schema.js';

const PER_LOT_STALE_THRESHOLD_MS = 5 * 60 * 1000;

function getId(req: IncomingMessage): string | null {
  const url = new URL(req.url ?? '', 'http://localhost');
  const fromQuery = url.searchParams.get('id');
  if (fromQuery) return fromQuery;
  // Path: /api/lots/<id>/ai-reset
  const segments = url.pathname.split('/').filter(Boolean);
  // segments: ['api','lots','<id>','ai-reset']
  if (segments.length >= 4 && segments[segments.length - 1] === 'ai-reset') {
    return segments[segments.length - 2];
  }
  return null;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    if (req.method !== 'POST') return methodNotAllowed(res);

    const id = getId(req);
    if (!id) return jsonError(res, 400, 'INVALID_REQUEST', 'Missing lot id');

    const { userId } = await requireAuth(req, 'admin', 'office');

    const updated = await asActor(userId, async (tx) => {
      const [current] = await tx.select().from(lot).where(eq(lot.id, id));
      if (!current) return { error: 'NOT_FOUND' as const };
      if (
        current.aiProcessingStartedAt !== null
        && Date.now() - current.aiProcessingStartedAt.getTime() < PER_LOT_STALE_THRESHOLD_MS
      ) {
        return { error: 'LOT_AI_IN_PROGRESS' as const };
      }
      const [row] = await tx.update(lot).set({
        lastAiRunStatus: null,
        lastAiRunError: null,
        aiProcessingStartedAt: null,
        updatedAt: new Date(),
      }).where(eq(lot.id, id)).returning();
      return { row };
    });

    if ('error' in updated) {
      if (updated.error === 'NOT_FOUND') return jsonError(res, 404, 'NOT_FOUND', 'Lot not found');
      return jsonError(res, 409, 'LOT_AI_IN_PROGRESS', 'AI is currently running on this lot; wait for it to complete');
    }
    return jsonOk(res, updated.row);
  } catch (err) {
    if (err instanceof AuthError) return jsonError(res, err.status, err.code, err.message);
    console.error(err);
    return jsonError(res, 500, 'INTERNAL', 'Internal server error');
  }
}
