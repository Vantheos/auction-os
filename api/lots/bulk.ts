// api/lots/bulk.ts
import type { IncomingMessage, ServerResponse } from 'node:http';
import { z } from 'zod';
import { eq, sql, inArray } from 'drizzle-orm';
import { AuthError, requireAuth } from '../_lib/auth.js';
import { readJson, EmptyBodyError } from '../_lib/body.js';
import { asActor, type Transaction } from '../_lib/db.js';
import { jsonError, jsonOk, methodNotAllowed } from '../_lib/responses.js';
import { lot } from '../../db/schema.js';
import { LotStateError, validateTransition, type LotState } from '../_lib/lot-state.js';
import { pgCodeOf, PG_UNIQUE_VIOLATION, PG_FK_VIOLATION } from '../_lib/pg-errors.js';

const VALID_STATES: LotState[] = ['assigned', 'unassigned', 'sold', 'picked-up', 'not-sellable'];

const Schema = z.object({
  action: z.enum(['change-state', 'move', 'delete']),
  lotIds: z.array(z.string().uuid()).min(1).max(500),
  params: z.record(z.unknown()).optional(),
});

type Result = { id: string; ok: true } | { id: string; ok: false; error: { code: string; message: string } };

// Typed error for known per-lot failures thrown inside savepoints
class BulkOpError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'BulkOpError';
  }
}

// Typed error for missing required params — translates to 400 in outer catch
class MissingParamError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MissingParamError';
  }
}

async function applyChangeState(tx: Transaction, lotIds: string[], to: LotState): Promise<Result[]> {
  // Fetch all lots in one query for efficiency
  const rows = await tx.select().from(lot).where(inArray(lot.id, lotIds));
  const byId = new Map(rows.map((r) => [r.id, r]));
  const results: Result[] = [];

  for (const id of lotIds) {
    const current = byId.get(id);
    if (!current) {
      results.push({ id, ok: false, error: { code: 'NOT_FOUND', message: 'Lot not found' } });
      continue;
    }
    try {
      validateTransition(current.state as LotState, to);
    } catch (e) {
      if (e instanceof LotStateError) {
        results.push({ id, ok: false, error: { code: 'ILLEGAL_TRANSITION', message: e.message } });
        continue;
      }
      throw e;
    }
    // Clear job/lot_number for states that require them null (schema CHECK enforces this)
    const update: Record<string, unknown> = { state: to, updatedAt: new Date() };
    if (to === 'unassigned' || to === 'not-sellable') {
      update.jobId = null;
      update.lotNumber = null;
    }
    await tx.update(lot).set(update).where(eq(lot.id, id));
    results.push({ id, ok: true });
  }
  return results;
}

async function applyDelete(tx: Transaction, lotIds: string[]): Promise<Result[]> {
  const results: Result[] = [];
  for (const id of lotIds) {
    const [deleted] = await tx.delete(lot).where(eq(lot.id, id)).returning({ id: lot.id });
    results.push(
      deleted
        ? { id, ok: true }
        : { id, ok: false, error: { code: 'NOT_FOUND', message: 'Lot not found' } }
    );
  }
  return results;
}

async function applyMove(tx: Transaction, lotIds: string[], destinationJobId: string): Promise<Result[]> {
  const results: Result[] = [];
  for (const id of lotIds) {
    // Each per-lot operation runs in its own SAVEPOINT (Drizzle nested tx).
    // When the inner block throws, only that savepoint rolls back; the outer
    // transaction continues so subsequent lots in the batch are unaffected.
    // This prevents a 23505/23503 on one lot from poisoning the whole batch
    // with 25P02 (in_failed_sql_transaction) on subsequent statements.
    try {
      await tx.transaction(async (sub) => {
        const [current] = await sub.select().from(lot).where(eq(lot.id, id));
        if (!current) {
          throw new BulkOpError('NOT_FOUND', 'Lot not found');
        }
        // Spec §4.2: only assigned lots can be moved
        if (current.state !== 'assigned') {
          throw new BulkOpError(
            'ILLEGAL_MOVE',
            `Cannot move lot in state ${current.state}; only assigned lots can be moved`
          );
        }
        // Reserve next lot_number in destination, baseline 10
        const [maxRow] = await sub
          .select({ maxN: sql<number>`COALESCE(MAX(${lot.lotNumber}), 9) + 1` })
          .from(lot)
          .where(eq(lot.jobId, destinationJobId));
        await sub.update(lot).set({
          jobId: destinationJobId,
          lotNumber: maxRow?.maxN ?? 10,
          updatedAt: new Date(),
        }).where(eq(lot.id, id));
      });
      results.push({ id, ok: true });
    } catch (err: unknown) {
      if (err instanceof BulkOpError) {
        results.push({ id, ok: false, error: { code: err.code, message: err.message } });
        continue;
      }
      const pg = pgCodeOf(err);
      if (pg === PG_UNIQUE_VIOLATION) {
        results.push({ id, ok: false, error: { code: 'LOT_NUMBER_CONFLICT', message: 'Lot number collision; retry' } });
        continue;
      }
      // 23503 = FK violation — destination job does not exist
      if (pg === PG_FK_VIOLATION) {
        results.push({ id, ok: false, error: { code: 'INVALID_DESTINATION', message: 'Destination job does not exist' } });
        continue;
      }
      throw err;
    }
  }
  return results;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    if (req.method !== 'POST') return methodNotAllowed(res);

    const { userId, role } = await requireAuth(req, 'admin', 'office');

    let body: unknown;
    try {
      body = await readJson(req);
    } catch (e) {
      if (e instanceof EmptyBodyError) return jsonError(res, 400, 'INVALID_BODY', 'Empty body');
      return jsonError(res, 400, 'INVALID_BODY', 'Invalid JSON');
    }

    const parsed = Schema.safeParse(body);
    if (!parsed.success) return jsonError(res, 400, 'INVALID_BODY', parsed.error.issues[0].message);

    // Bulk delete is admin-only
    if (parsed.data.action === 'delete' && role !== 'admin') {
      return jsonError(res, 403, 'FORBIDDEN', 'Bulk delete is admin-only');
    }

    let results: Result[];
    try {
      results = await asActor(userId, async (tx) => {
        switch (parsed.data.action) {
          case 'change-state': {
            const to = (parsed.data.params as { to?: string } | undefined)?.to;
            if (!to) throw new MissingParamError('change-state requires params.to');
            if (!VALID_STATES.includes(to as LotState)) {
              throw new MissingParamError(`Invalid target state: ${to}`);
            }
            return applyChangeState(tx, parsed.data.lotIds, to as LotState);
          }
          case 'delete':
            return applyDelete(tx, parsed.data.lotIds);
          case 'move': {
            const dst = (parsed.data.params as { destinationJobId?: string } | undefined)?.destinationJobId;
            if (!dst) throw new MissingParamError('move requires params.destinationJobId');
            return applyMove(tx, parsed.data.lotIds, dst);
          }
        }
      });
    } catch (err) {
      if (err instanceof MissingParamError) {
        return jsonError(res, 400, 'INVALID_BODY', err.message);
      }
      throw err;
    }

    return jsonOk(res, { results });
  } catch (err) {
    if (err instanceof AuthError) return jsonError(res, err.status, err.code, err.message);
    console.error(err);
    return jsonError(res, 500, 'INTERNAL', 'Internal server error');
  }
}
