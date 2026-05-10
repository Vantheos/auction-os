// api/jobs/[id].ts
import type { IncomingMessage, ServerResponse } from 'node:http';
import { z } from 'zod';
import { eq, sql } from 'drizzle-orm';
import { AuthError, requireAuth } from '../_lib/auth.js';
import { readJson, EmptyBodyError } from '../_lib/body.js';
import { asActor, getDb } from '../_lib/db.js';
import { jsonError, jsonOk, methodNotAllowed } from '../_lib/responses.js';
import { job } from '../../db/schema.js';

const CURRENCY_REGEX = /^\d+(\.\d{1,2})?$/;
const PatchSchema = z.object({
  jobNumber: z.string().min(1).max(200).optional(),
  closed: z.boolean().optional(),
  // Phase 5: Job-level export defaults are editable.
  startBid: z.string().regex(CURRENCY_REGEX, 'startBid must be a positive decimal').optional(),
  shippable: z.boolean().optional(),
});

function getId(req: IncomingMessage): string | null {
  const url = new URL(req.url ?? '', 'http://localhost');
  const fromQuery = url.searchParams.get('id');
  if (fromQuery) return fromQuery;
  const segments = url.pathname.split('/').filter(Boolean);
  return segments[segments.length - 1] || null;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    const id = getId(req);
    if (!id) return jsonError(res, 400, 'INVALID_REQUEST', 'Missing job id');

    if (req.method === 'GET') {
      await requireAuth(req);
      const db = getDb();
      const [row] = await db.select().from(job).where(eq(job.id, id));
      if (!row) return jsonError(res, 404, 'NOT_FOUND', 'Job not found');
      // Counts powering the AF360 export button gate. The button enables
      // only when total > 0 AND ready === total — i.e., every lot in the
      // job is assigned AND has title/description/price filled. Anything
      // else (lots in non-assigned state, lots missing data) keeps it
      // disabled. assignedLotCount is kept for backward-compat with any
      // legacy consumers but new gating logic should use the two new counts.
      const [{ total, assigned, ready, gaps }] = await db.execute<{
        total: number; assigned: number; ready: number; gaps: number;
      }>(sql`
        WITH job_lots AS (
          SELECT * FROM lot WHERE job_id = ${id}
        ),
        numbered AS (
          SELECT lot_number FROM job_lots WHERE lot_number IS NOT NULL
        )
        SELECT
          (SELECT COUNT(*)::int FROM job_lots) AS total,
          (SELECT COUNT(*)::int FROM job_lots WHERE state = 'assigned') AS assigned,
          (SELECT COUNT(*) FILTER (
            WHERE state = 'assigned'
              AND title IS NOT NULL AND title <> ''
              AND description IS NOT NULL AND description <> ''
              AND price IS NOT NULL
          )::int FROM job_lots) AS ready,
          -- Gap count = (range size 10..MAX) − (lots present in that range).
          -- Counts deleted-out / moved-out positions in the lot_number
          -- sequence; surfaces in the export-prep modal so the operator can
          -- compact before exporting to AF360.
          COALESCE(
            (SELECT MAX(lot_number) FROM numbered) - 9 - (SELECT COUNT(*)::int FROM numbered),
            0
          ) AS gaps
      `);
      return jsonOk(res, {
        ...row,
        assignedLotCount: assigned,
        totalLotCount: total,
        exportReadyLotCount: ready,
        lotNumberGapCount: gaps,
      });
    }

    if (req.method === 'PATCH') {
      const { userId } = await requireAuth(req, 'admin', 'office');
      let body: unknown;
      try {
        body = await readJson(req);
      } catch (e) {
        if (e instanceof EmptyBodyError) return jsonError(res, 400, 'INVALID_BODY', 'Empty body');
        return jsonError(res, 400, 'INVALID_BODY', 'Invalid JSON');
      }
      const parsed = PatchSchema.safeParse(body);
      if (!parsed.success) return jsonError(res, 400, 'INVALID_BODY', parsed.error.issues[0].message);

      const update: Record<string, unknown> = { updatedAt: new Date() };
      if (parsed.data.jobNumber !== undefined) update.jobNumber = parsed.data.jobNumber;
      if (parsed.data.closed !== undefined) update.closedAt = parsed.data.closed ? new Date() : null;
      if (parsed.data.startBid !== undefined) update.startBid = parsed.data.startBid;
      if (parsed.data.shippable !== undefined) update.shippable = parsed.data.shippable;

      const row = await asActor(userId, async (tx) => {
        // Phase 7: fetch existing row inside the same tx to detect
        // label-affecting jobNumber change before applying the update.
        const [before] = await tx.select().from(job).where(eq(job.id, id));
        if (!before) return null;

        const [r] = await tx.update(job).set(update).where(eq(job.id, id)).returning();

        // Phase 7: if jobNumber actually changed, every lot in this job has
        // a stale printed-label job-tail line. Cascade-flag in the same tx.
        // Other field changes (startBid, shippable, closedAt) don't affect
        // the label.
        if (parsed.data.jobNumber !== undefined && parsed.data.jobNumber !== before.jobNumber) {
          await tx.execute(sql`
            UPDATE lot SET label_reprint_needed = true, updated_at = NOW()
            WHERE job_id = ${id}
          `);
        }

        return r;
      });
      if (!row) return jsonError(res, 404, 'NOT_FOUND', 'Job not found');
      return jsonOk(res, row);
    }

    if (req.method === 'DELETE') {
      const { userId } = await requireAuth(req, 'admin');
      const row = await asActor(userId, async (tx) => {
        const [r] = await tx.delete(job).where(eq(job.id, id)).returning();
        return r;
      });
      if (!row) return jsonError(res, 404, 'NOT_FOUND', 'Job not found');
      return jsonOk(res, { ok: true });
    }

    return methodNotAllowed(res);
  } catch (err) {
    if (err instanceof AuthError) return jsonError(res, err.status, err.code, err.message);
    console.error(err);
    return jsonError(res, 500, 'INTERNAL', 'Internal server error');
  }
}
