// api/jobs/[id]/export-af360/start.ts
//
// Phase 5 Area 5 — Step 1 of the AF360 export flow. Lightweight endpoint
// that resolves the job + customer, validates pre-flight conditions, queries
// the assigned lots, builds the CSV inline, and returns a batch plan that
// the client iterates through (each batch hits /batch endpoint to build a
// per-batch image zip uploaded to Vercel Blob).
//
// Auth: admin or office. Warehouse cannot export.
//
// See spec docs/superpowers/specs/2026-05-04-phase-5-design.md §3.5.

import type { IncomingMessage, ServerResponse } from 'node:http';
import { and, asc, eq } from 'drizzle-orm';
import { AuthError, requireAuth } from '../../../_lib/auth.js';
import { getDb } from '../../../_lib/db.js';
import { jsonError, jsonOk, methodNotAllowed } from '../../../_lib/responses.js';
import { customer, job, lot } from '../../../../db/schema.js';
import {
  AF360_HIBID,
  buildAF360Csv,
  slugify,
  type ExportContext,
} from '../../../../src/lib/exporters/af360.js';
import type { ExportStartResponse, ExportBatchPlanItem } from '../../../../shared/types.js';

const BATCH_SIZE = 100;

function getId(req: IncomingMessage): string | null {
  const url = new URL(req.url ?? '', 'http://localhost');
  const fromQuery = url.searchParams.get('id');
  if (fromQuery) return fromQuery;
  const segs = url.pathname.split('/').filter(Boolean);
  // /api/jobs/<id>/export-af360/start → segs = ['api','jobs','<id>','export-af360','start']
  return segs.length >= 5 ? segs[2] : null;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    if (req.method !== 'POST') return methodNotAllowed(res);

    await requireAuth(req, 'admin', 'office');

    const id = getId(req);
    if (!id) return jsonError(res, 400, 'INVALID_REQUEST', 'Missing job id');

    const db = getDb();

    // Resolve job + its customer
    const [row] = await db
      .select({ job, customer })
      .from(job)
      .innerJoin(customer, eq(job.customerId, customer.id))
      .where(eq(job.id, id));

    if (!row) return jsonError(res, 404, 'NOT_FOUND', 'Job not found');

    // Pre-flight 1: SellerCode required
    if (!row.customer.sellerCode || row.customer.sellerCode.trim() === '') {
      return jsonError(
        res,
        400,
        'SELLER_CODE_REQUIRED',
        `Seller Code is not set for ${row.customer.name}. Update via Customers → ${row.customer.name} before exporting.`
      );
    }

    // Query assigned lots for this job, ordered by lot_number ASC.
    const lots = await db
      .select()
      .from(lot)
      .where(and(eq(lot.jobId, id), eq(lot.state, 'assigned')))
      .orderBy(asc(lot.lotNumber));

    // Pre-flight 2: at least one assigned lot
    if (lots.length === 0) {
      return jsonError(res, 400, 'NO_LOTS', 'Job has no assigned lots ready for export.');
    }

    // Build CSV
    const contexts: ExportContext[] = lots.map((l) => ({
      lot: {
        lotNumber: l.lotNumber,
        title: l.title,
        description: l.description,
        quantity: l.quantity,
      },
      job: {
        startBid: row.job.startBid,
        shippable: row.job.shippable,
      },
      customer: {
        sellerCode: row.customer.sellerCode,
      },
    }));
    const csv = buildAF360Csv(contexts);

    // Compute batch plan
    const totalBatches = Math.ceil(lots.length / BATCH_SIZE);
    const batches: ExportBatchPlanItem[] = [];
    for (let i = 0; i < totalBatches; i++) {
      const start = i * BATCH_SIZE;
      const end = Math.min(start + BATCH_SIZE, lots.length);
      batches.push({
        batchNum: i + 1,
        lotIds: lots.slice(start, end).map((l) => l.id),
      });
    }

    const exportLabel = `JobExport-${slugify(row.customer.name)}-${row.job.jobNumber}-${todayIso()}`;
    const csvFilename = `${exportLabel}.csv`;

    const response: ExportStartResponse = {
      csv,
      csvFilename,
      batchSize: BATCH_SIZE,
      totalBatches,
      totalLots: lots.length,
      batches,
      exportLabel,
    };

    // Reference AF360_HIBID so the platform const stays the source of truth
    // for the CSV header order (used in buildAF360Csv internally).
    void AF360_HIBID;

    return jsonOk(res, response);
  } catch (err) {
    if (err instanceof AuthError) return jsonError(res, err.status, err.code, err.message);
    console.error(err);
    return jsonError(res, 500, 'INTERNAL', 'Internal server error');
  }
}
