// api/lots/[id].ts
import type { IncomingMessage, ServerResponse } from 'node:http';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { AuthError, requireAuth } from '../_lib/auth.js';
import { readJson, EmptyBodyError } from '../_lib/body.js';
import { asActor, getDb } from '../_lib/db.js';
import { jsonError, jsonOk, methodNotAllowed } from '../_lib/responses.js';
import { customer, job, lot, lotPhoto } from '../../db/schema.js';
import { LotStateError, stateTransitionFields, validateTransition, type LotState } from '../_lib/lot-state.js';
import { removeObjects } from '../_lib/storage.js';

const PatchSchema = z.object({
  state: z.enum(['assigned', 'unassigned', 'sold', 'picked-up', 'not-sellable']).optional(),
  title: z.string().max(50).optional().nullable(),
  description: z.string().max(2000).optional().nullable(),
  price: z.string().regex(/^\d+(\.\d{1,2})?$/).optional().nullable(),
  quantity: z.number().int().positive().optional(),
  ref1: z.string().max(200).optional().nullable(),
  ref2: z.string().max(200).optional().nullable(),
  specialNotesCategory: z.enum(['None', 'TOOL ONLY', 'READ', 'CLOTHING']).optional(),
  specialNotesText: z.string().max(200).optional().nullable(),
  untested: z.boolean().optional(),
});

function getId(req: IncomingMessage): string | null {
  const url = new URL(req.url ?? '', 'http://localhost');
  const fromQuery = url.searchParams.get('id');
  if (fromQuery) return fromQuery;
  const segs = url.pathname.split('/').filter(Boolean);
  return segs[segs.length - 1] || null;
}

async function fetchLot(db: ReturnType<typeof getDb>, id: string) {
  const [row] = await db
    .select({ lot, customerName: customer.name, jobNumber: job.jobNumber, customerId: customer.id })
    .from(lot)
    .leftJoin(job, eq(lot.jobId, job.id))
    .leftJoin(customer, eq(job.customerId, customer.id))
    .where(eq(lot.id, id));
  return row ? { ...row.lot, customerName: row.customerName, jobNumber: row.jobNumber, customerId: row.customerId } : null;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    const id = getId(req);
    if (!id) return jsonError(res, 400, 'INVALID_REQUEST', 'Missing lot id');

    if (req.method === 'GET') {
      await requireAuth(req);
      const row = await fetchLot(getDb(), id);
      if (!row) return jsonError(res, 404, 'NOT_FOUND', 'Lot not found');
      return jsonOk(res, row);
    }

    if (req.method === 'PATCH') {
      const { userId, role } = await requireAuth(req, 'admin', 'office', 'warehouse');
      let body: unknown;
      try { body = await readJson(req); }
      catch (e) {
        if (e instanceof EmptyBodyError) return jsonError(res, 400, 'INVALID_BODY', 'Empty body');
        return jsonError(res, 400, 'INVALID_BODY', 'Invalid JSON');
      }
      const parsed = PatchSchema.safeParse(body);
      if (!parsed.success) return jsonError(res, 400, 'INVALID_BODY', parsed.error.issues[0].message);

      // Fetch current state for validation
      const current = await fetchLot(getDb(), id);
      if (!current) return jsonError(res, 404, 'NOT_FOUND', 'Lot not found');

      // Phase 6: per-lot AI processing lock — reject field edits while AI
      // is generating content for this lot. State changes still pass through
      // (operator should be able to e.g. mark not-sellable mid-AI run).
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
      const isAiInFlight =
        current.aiProcessingStartedAt !== null &&
        current.aiProcessingStartedAt > fiveMinAgo;
      const hasFieldEdits = Object.keys(parsed.data).some((k) => k !== 'state');
      if (isAiInFlight && hasFieldEdits) {
        return jsonError(res, 423, 'LOT_AI_IN_PROGRESS', 'AI is currently generating content for this lot');
      }

      // Warehouse can edit fields (per UI design spec — required by the
      // cataloging autosave path) but cannot change lot state. State changes
      // remain admin/office only.
      const isStateChange = !!parsed.data.state && parsed.data.state !== current.state;
      if (isStateChange && role === 'warehouse') {
        return jsonError(res, 403, 'FORBIDDEN', 'Warehouse cannot change lot state');
      }

      // Validate state transition if state is being changed
      if (parsed.data.state && parsed.data.state !== current.state) {
        try {
          validateTransition(current.state as LotState, parsed.data.state);
        } catch (e) {
          if (e instanceof LotStateError) {
            return jsonError(res, 422, 'ILLEGAL_TRANSITION', e.message);
          }
          throw e;
        }
      }

      // Frozen states: only state change allowed (no field edits).
      // `sold` is frozen because the lot was sold to a buyer at the price/quantity
      // displayed on the auction platform; edits would mutate what was sold.
      const isFrozen = current.state === 'sold' || current.state === 'picked-up' || current.state === 'not-sellable';
      if (isFrozen && hasFieldEdits) {
        return jsonError(res, 422, 'FROZEN', `Lot in ${current.state} cannot be edited`);
      }

      const update: Record<string, unknown> = { updatedAt: new Date() };
      for (const [k, v] of Object.entries(parsed.data)) {
        if (k !== 'state' && v !== undefined) update[k] = v;
      }
      // State transitions affect (job_id, lot_number) per state_tuple_consistent constraint
      if (parsed.data.state) {
        Object.assign(update, stateTransitionFields(parsed.data.state));
      }

      const updated = await asActor(userId, async (tx) => {
        const [row] = await tx.update(lot).set(update).where(eq(lot.id, id)).returning();
        return row;
      });
      if (!updated) return jsonError(res, 404, 'NOT_FOUND', 'Lot not found');
      const fresh = await fetchLot(getDb(), id);
      return jsonOk(res, fresh ?? updated);
    }

    if (req.method === 'DELETE') {
      const { userId, role } = await requireAuth(req, 'admin', 'warehouse');

      // Warehouse delete policy: only the lot the user actively cataloged AND
      // hasn't yet advanced past. Server proxy: intakeOperatorId match AND
      // state='assigned' (the post-creation state cataloging always lands in,
      // which only admin/office can transition out of). Once admin/office
      // moves the lot to unassigned/sold/etc., warehouse loses the ability to
      // delete it. The UI never exposes Delete to warehouse outside the
      // cataloging Discard flow, which targets the active session lot.
      if (role === 'warehouse') {
        const current = await fetchLot(getDb(), id);
        if (!current) return jsonError(res, 404, 'NOT_FOUND', 'Lot not found');
        if (current.intakeOperatorId !== userId) {
          return jsonError(res, 403, 'FORBIDDEN', 'Cannot delete a lot you did not catalog');
        }
        if (current.state !== 'assigned') {
          return jsonError(res, 403, 'FORBIDDEN', 'Cannot delete a lot once cataloging is complete');
        }
      }

      // Capture storage paths BEFORE deleting (cascade drops lot_photo rows).
      const photoPaths = (await getDb().select({ p: lotPhoto.storagePath })
        .from(lotPhoto)
        .where(eq(lotPhoto.lotId, id))).map((r) => r.p);

      const deleted = await asActor(userId, async (tx) => {
        const [row] = await tx.delete(lot).where(eq(lot.id, id)).returning();
        return row;
      });
      if (!deleted) return jsonError(res, 404, 'NOT_FOUND', 'Lot not found');

      // Best-effort: remove storage objects after the DB transaction commits.
      // If this fails, the cleanup-orphan-lots cron will not catch them
      // (lot row is gone), so any failure is logged for manual reconciliation.
      if (photoPaths.length > 0) {
        await removeObjects(photoPaths);
      }

      return jsonOk(res, { ok: true });
    }

    return methodNotAllowed(res);
  } catch (err) {
    if (err instanceof AuthError) return jsonError(res, err.status, err.code, err.message);
    console.error(err);
    return jsonError(res, 500, 'INTERNAL', 'Internal server error');
  }
}
