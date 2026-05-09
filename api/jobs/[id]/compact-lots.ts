// api/jobs/[id]/compact-lots.ts
//
// POST /api/jobs/:id/compact-lots — fills gaps in a job's lot_number
// sequence by moving the highest-numbered lots into the lowest gaps,
// minimizing the number of physical labels that need reprinting.
//
// Algorithm: at each iteration, pair the lowest gap in [10..MAX] with
// the highest current lot_number; move the lot to the gap; repeat
// until no gaps remain below the (decreasing) MAX. Each moved lot's
// `label_reprint_needed` flag is set so the operator sees a pill on
// the row and can find them via the Reprint pending filter.
//
// Auth: admin or office. Warehouse cannot compact.
//
// Concurrency: per-job advisory transaction lock (same hashtext(jobId)
// pattern used by POST /api/lots) so concurrent compacts and creates
// can't race the gap state.

import type { IncomingMessage, ServerResponse } from 'node:http';
import { and, eq, sql } from 'drizzle-orm';
import { AuthError, requireAuth } from '../../_lib/auth.js';
import { asActor } from '../../_lib/db.js';
import { jsonError, jsonOk, methodNotAllowed } from '../../_lib/responses.js';
import { job, lot } from '../../../db/schema.js';

function getId(req: IncomingMessage): string | null {
  const url = new URL(req.url ?? '', 'http://localhost');
  const fromQuery = url.searchParams.get('id');
  if (fromQuery) return fromQuery;
  const segs = url.pathname.split('/').filter(Boolean);
  // /api/jobs/<id>/compact-lots → segs = ['api','jobs','<id>','compact-lots']
  return segs.length >= 4 && segs[segs.length - 1] === 'compact-lots' ? segs[2] : null;
}

export type CompactMove = { lotId: string; oldNumber: number; newNumber: number };
export type CompactResponse = { moves: CompactMove[]; renumbered: number };

/**
 * Compute the moves needed to compact a job's lot-number sequence.
 * Pure function over an array of {id, lot_number}; the caller applies
 * the moves in a transaction. Iterative — moving the highest into the
 * lowest gap shrinks MAX by 1, which can eliminate other "gaps" that
 * were past the new MAX.
 */
export function computeCompactMoves(
  lots: { id: string; lotNumber: number }[],
): CompactMove[] {
  if (lots.length === 0) return [];
  // Sorted ascending by lot_number for set-membership math.
  const sorted = [...lots].sort((a, b) => a.lotNumber - b.lotNumber);
  // Mutable state we walk over.
  type Cell = { id: string; lotNumber: number };
  const arr: Cell[] = sorted.map((l) => ({ id: l.id, lotNumber: l.lotNumber }));
  const moves: CompactMove[] = [];

  while (true) {
    const current: Cell[] = [...arr].sort((a, b) => a.lotNumber - b.lotNumber);
    const max = current[current.length - 1].lotNumber;
    const present = new Set(current.map((c) => c.lotNumber));
    // Find lowest gap in [10..max].
    let gap: number | null = null;
    for (let n = 10; n <= max; n++) {
      if (!present.has(n)) { gap = n; break; }
    }
    if (gap === null) return moves;
    // Highest cell. We move it to the gap. If the highest is below the
    // gap (degenerate state where max < smallest possible gap), nothing
    // to do — bail.
    const highest = current[current.length - 1];
    if (highest.lotNumber <= gap) return moves;

    moves.push({
      lotId: highest.id,
      oldNumber: highest.lotNumber,
      newNumber: gap,
    });
    // Reflect the move in `arr` for the next iteration.
    const idx = arr.findIndex((c) => c.id === highest.id);
    if (idx >= 0) arr[idx] = { id: highest.id, lotNumber: gap };
  }
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    if (req.method !== 'POST') return methodNotAllowed(res);

    const { userId } = await requireAuth(req, 'admin', 'office');

    const id = getId(req);
    if (!id) return jsonError(res, 400, 'INVALID_REQUEST', 'Missing job id');

    const result = await asActor(userId, async (tx) => {
      // Verify job exists (cheap; 404 is friendlier than a silent no-op).
      const [j] = await tx.select({ id: job.id }).from(job).where(eq(job.id, id));
      if (!j) return { error: 'NOT_FOUND' as const };

      // Per-job advisory lock — held for the duration of the transaction.
      // Concurrent compacts or creates against the same job queue rather
      // than racing the gap state. Same hashtext(jobId) keyspace as POST
      // /api/lots so they serialize against each other too.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${id}))`);

      const rows = await tx
        .select({ id: lot.id, lotNumber: lot.lotNumber })
        .from(lot)
        .where(and(eq(lot.jobId, id), sql`${lot.lotNumber} IS NOT NULL`));
      // lot.lotNumber is nullable in the schema (unassigned/not-sellable
      // rows clear it to satisfy state_tuple_consistent), but the WHERE
      // above filters those out.
      const present = rows.map((r) => ({ id: r.id, lotNumber: r.lotNumber as number }));

      const moves = computeCompactMoves(present);
      if (moves.length === 0) {
        return { ok: { moves: [], renumbered: 0 } };
      }

      // Apply each move. Order matters for the unique (job_id, lot_number)
      // partial index: a target slot must be empty at the moment of UPDATE.
      // The algorithm guarantees this — each `newNumber` is a gap when its
      // move executes — but we apply in the moves array's order regardless
      // (highest-first, since each shrinks MAX by one).
      for (const m of moves) {
        await tx
          .update(lot)
          .set({
            lotNumber: m.newNumber,
            labelReprintNeeded: true,
            updatedAt: new Date(),
          })
          .where(eq(lot.id, m.lotId));
      }
      return { ok: { moves, renumbered: moves.length } };
    });

    if ('error' in result) {
      if (result.error === 'NOT_FOUND') return jsonError(res, 404, 'NOT_FOUND', 'Job not found');
    }
    if ('ok' in result) {
      return jsonOk(res, result.ok);
    }
    return jsonError(res, 500, 'INTERNAL', 'Unexpected compact result shape');
  } catch (err) {
    if (err instanceof AuthError) return jsonError(res, err.status, err.code, err.message);
    console.error('compact-lots error:', err);
    return jsonError(res, 500, 'INTERNAL', 'Internal server error');
  }
}
