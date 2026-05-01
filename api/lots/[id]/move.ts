// api/lots/[id]/move.ts
import type { IncomingMessage, ServerResponse } from 'node:http';
import { z } from 'zod';
import { eq, sql } from 'drizzle-orm';
import { AuthError, requireAuth } from '../../_lib/auth.js';
import { readJson, EmptyBodyError } from '../../_lib/body.js';
import { asActor, getDb } from '../../_lib/db.js';
import { jsonError, jsonOk, methodNotAllowed } from '../../_lib/responses.js';
import { pgCodeOf, PG_UNIQUE_VIOLATION } from '../../_lib/pg-errors.js';
import { customer, job, lot } from '../../../db/schema.js';

const Schema = z.object({ destinationJobId: z.string().uuid() });

function getId(req: IncomingMessage): string | null {
  const url = new URL(req.url ?? '', 'http://localhost');
  const fromQuery = url.searchParams.get('id');
  if (fromQuery) return fromQuery;
  const segs = url.pathname.split('/').filter(Boolean);
  // /api/lots/<id>/move → segs = ['api', 'lots', '<id>', 'move']
  return segs.length >= 4 ? segs[2] : null;
}

class IllegalMoveError extends Error {
  constructor(public from: string) {
    super(`Cannot move lot in state ${from}; only assigned and unassigned lots can be moved`);
    this.name = 'IllegalMoveError';
  }
}

async function fetchLotJoined(db: ReturnType<typeof getDb>, id: string) {
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
    if (req.method !== 'POST') return methodNotAllowed(res);

    const { userId } = await requireAuth(req, 'admin', 'office');

    const id = getId(req);
    if (!id) return jsonError(res, 400, 'INVALID_REQUEST', 'Missing lot id');

    let body: unknown;
    try { body = await readJson(req); }
    catch (e) {
      if (e instanceof EmptyBodyError) return jsonError(res, 400, 'INVALID_BODY', 'Empty body');
      return jsonError(res, 400, 'INVALID_BODY', 'Invalid JSON');
    }
    const parsed = Schema.safeParse(body);
    if (!parsed.success) return jsonError(res, 400, 'INVALID_BODY', parsed.error.issues[0].message);

    let movedId: string | null = null;
    try {
      movedId = await asActor(userId, async (tx) => {
        // Fetch + state guard inside the transaction
        const [current] = await tx.select().from(lot).where(eq(lot.id, id));
        if (!current) return null;
        if (current.state !== 'assigned' && current.state !== 'unassigned') {
          throw new IllegalMoveError(current.state);
        }
        const wasUnassigned = current.state === 'unassigned';
        // Reserve next lot_number in destination, baseline 10
        const [maxRow] = await tx
          .select({ maxN: sql<number>`COALESCE(MAX(${lot.lotNumber}), 9) + 1` })
          .from(lot)
          .where(eq(lot.jobId, parsed.data.destinationJobId));
        const nextLotNumber = maxRow?.maxN ?? 10;
        const [updated] = await tx.update(lot).set({
          jobId: parsed.data.destinationJobId,
          lotNumber: nextLotNumber,
          ...(wasUnassigned ? { state: 'assigned' as const } : {}),
          updatedAt: new Date(),
        }).where(eq(lot.id, id)).returning();
        return updated.id;
      });
    } catch (err: unknown) {
      if (err instanceof IllegalMoveError) {
        return jsonError(res, 422, 'ILLEGAL_MOVE', err.message);
      }
      if (pgCodeOf(err) === PG_UNIQUE_VIOLATION) {
        return jsonError(res, 409, 'LOT_NUMBER_CONFLICT', 'Destination has a colliding lot number; retry');
      }
      throw err;
    }

    if (!movedId) return jsonError(res, 404, 'NOT_FOUND', 'Lot not found');
    const fresh = await fetchLotJoined(getDb(), movedId);
    return jsonOk(res, fresh);
  } catch (err) {
    if (err instanceof AuthError) return jsonError(res, err.status, err.code, err.message);
    console.error(err);
    return jsonError(res, 500, 'INTERNAL', 'Internal server error');
  }
}
