// api/ai/backlog.ts
// POST /api/ai/backlog — drains the AI eligibility queue.
// Two callers:
//   - Vercel cron (?source=cron) → uses requireCronAuth, applies schedule gate
//   - Run Now button (no ?source) → uses requireAuth(admin|office), bypasses gate
// Both go through the same processing flow. Single-runner system lock.
// Drain-eagerly: ai_last_run_at advances ONLY when remaining=0.

import type { IncomingMessage, ServerResponse } from 'node:http';
import { eq, sql, and } from 'drizzle-orm';
import { AuthError, requireAuth } from '../_lib/auth.js';
import { requireCronAuth } from '../_lib/cron-auth.js';
import { getDb } from '../_lib/db.js';
import { jsonError, jsonOk, methodNotAllowed } from '../_lib/responses.js';
import { bulkSignReadUrls } from '../_lib/storage.js';
import { finalizeLotRun } from '../_lib/ai-finalize.js';
import { PER_LOT_STALE_THRESHOLD_SQL } from '../_lib/ai-thresholds.js';
import { mostRecentScheduledTime } from '../_lib/ai-schedule.js';
import { lotPhoto, systemSettings } from '../../db/schema.js';
import { runAiForLot, tryExtractUsageFromError } from '../../src/lib/ai/anthropic.js';
import { computeCostCents } from '../../src/lib/ai/model.js';
import {
  composeTitle, composeDescription, determineFieldStatus, mapStatus, buildErrorString,
} from '../../src/lib/ai/compose.js';
import { pLimit } from '../../src/lib/ai/p-limit.js';

// Cap on lots processed per invocation. Exported so tests can derive the
// expected processed/remaining split from the actual constant.
export const CAP_PER_INVOCATION = 20;
const CONCURRENCY = 3;
// System-level lock TTL — separate concept from PER_LOT_STALE_THRESHOLD
// even though both currently equal 5 min. The lock is held for the
// duration of one invocation; the per-lot threshold is the staleness
// window for a per-lot processing flag.
const SYSTEM_LOCK_TTL = sql`interval '5 minutes'`;

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    if (req.method !== 'POST' && req.method !== 'GET') return methodNotAllowed(res);

    const url = new URL(req.url ?? '', 'http://localhost');
    const isCronCall = url.searchParams.get('source') === 'cron';

    let operatorUserId: string | null = null;
    if (isCronCall) {
      requireCronAuth(req);
    } else {
      const auth = await requireAuth(req, 'admin', 'office');
      operatorUserId = auth.userId;
    }

    const db = getDb();
    const [settings] = await db.select().from(systemSettings).where(eq(systemSettings.id, 1));
    if (!settings) return jsonError(res, 500, 'SETTINGS_MISSING', 'system_settings singleton missing');

    // Schedule gate (cron only). Two reasons to proceed:
    //   (a) drain-in-progress: a previous tick (cron or Run Now) opened a
    //       drain cycle that hasn't reached remaining=0 yet — keep going.
    //   (b) a scheduled grid time has passed since the last completed
    //       drain (or there's never been one).
    // Otherwise: throttle. The grid is timeOfDay + N*intervalHours,
    // recomputed live each tick so config changes apply naturally.
    if (isCronCall) {
      if (!settings.aiScheduleEnabled) return jsonOk(res, { skipped: true, reason: 'disabled' });
      if (!settings.aiDrainInProgress) {
        const grid = mostRecentScheduledTime(new Date(), settings.aiScheduleTimeOfDay, settings.aiScheduleIntervalHours);
        if (settings.aiLastRunAt !== null && settings.aiLastRunAt.getTime() >= grid.getTime()) {
          return jsonOk(res, { skipped: true, reason: 'too_soon' });
        }
      }
    }

    // Acquire system-level lock atomically
    const lockResult = await db.execute<{ ai_run_lock_until: Date }>(sql`
      UPDATE system_settings
         SET ai_run_lock_until = NOW() + ${SYSTEM_LOCK_TTL}
       WHERE id = 1
         AND (ai_run_lock_until IS NULL OR ai_run_lock_until < NOW())
       RETURNING ai_run_lock_until
    `);
    if (lockResult.length === 0) return jsonOk(res, { skipped: true, reason: 'in_progress' });

    // Mark the drain cycle as open so subsequent cron heartbeats keep
    // continuing it until remaining=0, regardless of where on the schedule
    // grid we are. Idempotent: cron-triggered ticks may already see this
    // set from a Run Now that left work pending, in which case it's a no-op.
    await db.execute(sql`UPDATE system_settings SET ai_drain_in_progress = true WHERE id = 1`);

    let processed = 0;
    let errors = 0;

    try {
      // Fetch eligible lots up to cap. Eligibility excludes lots that an
      // operator has already filled by hand (title + description + price
      // all populated) — running AI on them would otherwise overwrite the
      // operator's entries and waste an Anthropic call. Empty = NULL or ''
      // for text; NULL only for price (zero is a valid operator decision).
      const eligible = await db.execute<{
        id: string;
        quantity: number;
        special_notes_category: 'None' | 'TOOL ONLY' | 'READ' | 'CLOTHING';
        special_notes_text: string | null;
        untested: boolean;
        ref1: string | null;
        ref2: string | null;
      }>(sql`
        SELECT l.id, l.quantity, l.special_notes_category, l.special_notes_text,
               l.untested, l.ref1, l.ref2
          FROM lot l
         WHERE l.last_ai_run_status IS NULL
           AND l.state IN ('assigned', 'unassigned')
           AND (l.title IS NULL OR l.title = ''
                OR l.description IS NULL OR l.description = ''
                OR l.price IS NULL)
           AND (l.ai_processing_started_at IS NULL
                OR l.ai_processing_started_at < NOW() - ${PER_LOT_STALE_THRESHOLD_SQL})
         ORDER BY l.intake_timestamp ASC
         LIMIT ${CAP_PER_INVOCATION}
      `);

      const limit = pLimit(CONCURRENCY);
      const results = await Promise.allSettled(eligible.map((row) => limit(() => processOne(row, operatorUserId))));
      for (const r of results) {
        if (r.status === 'fulfilled') processed++;
        else errors++;
      }

      // Compute remaining (re-query) and update ai_last_run_at if drained.
      // Same eligibility filter as the SELECT above so the count reflects
      // what the next tick would actually process.
      const [{ remaining }] = await db.execute<{ remaining: number }>(sql`
        SELECT COUNT(*)::int AS remaining
          FROM lot
         WHERE last_ai_run_status IS NULL
           AND state IN ('assigned', 'unassigned')
           AND (title IS NULL OR title = ''
                OR description IS NULL OR description = ''
                OR price IS NULL)
           AND (ai_processing_started_at IS NULL
                OR ai_processing_started_at < NOW() - ${PER_LOT_STALE_THRESHOLD_SQL})
      `);

      // Drain-eagerly tail. When the queue is empty, close the drain cycle
      // (clears ai_drain_in_progress) and advance ai_last_run_at so the
      // schedule gate throttles until the next grid time. This bumps even
      // when processed=0 (idle no-op) — that's intentional, the operator's
      // schedule should govern when we re-check, not the cron's 15-min
      // heartbeat. While the drain is still open (remaining > 0), leave
      // both flags as is; the next tick continues the cycle.
      if (remaining === 0) {
        await db.execute(sql`
          UPDATE system_settings
             SET ai_last_run_at = NOW(),
                 ai_drain_in_progress = false
           WHERE id = 1
        `);
      }

      // Release system lock (always)
      await db.execute(sql`UPDATE system_settings SET ai_run_lock_until = NULL WHERE id = 1`);

      return jsonOk(res, { processed, remaining, errors });
    } catch (err) {
      // Outer-flow error: ensure lock released, then rethrow to outer handler
      await db.execute(sql`UPDATE system_settings SET ai_run_lock_until = NULL WHERE id = 1`);
      throw err;
    }
  } catch (err) {
    if (err instanceof AuthError) return jsonError(res, err.status, err.code, err.message);
    console.error('ai-backlog error:', err);
    return jsonError(res, 500, 'INTERNAL', 'Internal server error');
  }
}

type EligibleRow = {
  id: string;
  quantity: number;
  special_notes_category: 'None' | 'TOOL ONLY' | 'READ' | 'CLOTHING';
  special_notes_text: string | null;
  untested: boolean;
  ref1: string | null;
  ref2: string | null;
};

async function processOne(row: EligibleRow, operatorUserId: string | null): Promise<void> {
  const db = getDb();

  // Per-lot atomic claim
  const claimed = await db.execute<{ id: string }>(sql`
    UPDATE lot SET ai_processing_started_at = NOW()
     WHERE id = ${row.id}
       AND (ai_processing_started_at IS NULL
            OR ai_processing_started_at < NOW() - ${PER_LOT_STALE_THRESHOLD_SQL})
     RETURNING id
  `);
  if (claimed.length === 0) return; // someone else got it

  try {
    const photos = await db.select({ path: lotPhoto.storagePath })
      .from(lotPhoto)
      .where(and(eq(lotPhoto.lotId, row.id), eq(lotPhoto.status, 'uploaded')));
    const signed = await bulkSignReadUrls(
      photos.map((p) => p.path),
      { width: 1568, quality: 80, resize: 'contain' },
    );
    const photoUrls = photos.map((p) => signed.get(p.path)).filter((u): u is string => !!u);

    const result = await runAiForLot({
      photoUrls,
      operatorFields: {
        quantity: row.quantity,
        specialNotesCategory: row.special_notes_category,
        specialNotesText: row.special_notes_text,
        untested: row.untested,
        ref1: row.ref1,
        ref2: row.ref2,
      },
    });

    const fieldStatuses = determineFieldStatus({
      brand: result.output.brand,
      briefDescription: result.output.brief_description,
      descriptionBody: result.output.description_body,
      price: result.output.price,
    });

    await finalizeLotRun(row.id, operatorUserId, {
      title: composeTitle({
        brand: result.output.brand,
        briefDescription: result.output.brief_description,
        price: result.output.price,
        quantity: row.quantity,
        specialNotesCategory: row.special_notes_category,
      }),
      description: composeDescription({
        body: result.output.description_body,
        specialNotesCategory: row.special_notes_category,
        specialNotesText: row.special_notes_text,
        untested: row.untested,
      }),
      price: result.output.price !== null ? result.output.price.toFixed(2) : null,
      lastAiRunStatus: mapStatus(fieldStatuses),
      lastAiRunError: buildErrorString(fieldStatuses),
    }, result.costCents);
  } catch (err) {
    const usage = tryExtractUsageFromError(err);
    const costCents = computeCostCents(usage.inputTokens, usage.outputTokens);
    const errorMsg = err instanceof Error ? err.message.slice(0, 500) : 'Unknown AI error';

    // Failure path omits title/description/price so we don't clobber
    // any operator-entered values that may have existed before the run.
    await finalizeLotRun(row.id, operatorUserId, {
      lastAiRunStatus: 'failure',
      lastAiRunError: errorMsg,
    }, costCents);

    throw err; // propagate so outer Promise.allSettled tracks as error
  }
}
