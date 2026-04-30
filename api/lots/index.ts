// api/lots/index.ts
import type { IncomingMessage, ServerResponse } from 'node:http';
import { z } from 'zod';
import { and, eq, sql, inArray, desc, count } from 'drizzle-orm';
import { AuthError, requireAuth } from '../_lib/auth.js';
import { readJson, EmptyBodyError } from '../_lib/body.js';
import { asActor, getDb } from '../_lib/db.js';
import { jsonError, jsonOk, methodNotAllowed } from '../_lib/responses.js';
import { customer, job, lot } from '../../db/schema.js';

const CreateSchema = z.object({
  jobId: z.string().uuid(),
  quantity: z.number().int().positive().optional(),
  title: z.string().max(50).optional(),
  description: z.string().max(2000).optional(),
  price: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
  ref1: z.string().max(200).optional(),
  ref2: z.string().max(200).optional(),
  specialNotesCategory: z.enum(['None', 'TOOL ONLY', 'READ', 'CLOTHING']).optional(),
  specialNotesText: z.string().max(200).optional(),
  untested: z.boolean().optional(),
});

const STATES = ['assigned', 'unassigned', 'sold', 'picked-up', 'not-sellable'] as const;

function parseStateFilter(q: URLSearchParams): typeof STATES[number][] | null {
  const raw = q.getAll('state');
  if (raw.length === 0) return null;
  return raw.filter((s): s is typeof STATES[number] => (STATES as readonly string[]).includes(s));
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    if (req.method === 'GET') {
      await requireAuth(req);
      const url = new URL(req.url ?? '', 'http://localhost');
      const customerId = url.searchParams.get('customerId');
      const jobId = url.searchParams.get('jobId');
      const states = parseStateFilter(url.searchParams);
      const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10), 200);
      const offset = parseInt(url.searchParams.get('offset') ?? '0', 10);

      const db = getDb();
      const conditions = [];
      if (jobId) conditions.push(eq(lot.jobId, jobId));
      if (customerId) conditions.push(eq(job.customerId, customerId));
      if (states) conditions.push(inArray(lot.state, states));

      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const rows = await db
        .select({
          lot,
          customerName: customer.name,
          jobNumber: job.jobNumber,
          customerId: customer.id,
        })
        .from(lot)
        .leftJoin(job, eq(lot.jobId, job.id))
        .leftJoin(customer, eq(job.customerId, customer.id))
        .where(where)
        .orderBy(desc(lot.createdAt))
        .limit(limit)
        .offset(offset);

      const totalQ = await db
        .select({ n: count() })
        .from(lot)
        .leftJoin(job, eq(lot.jobId, job.id))
        .where(where);
      const total = totalQ[0]?.n ?? 0;

      return jsonOk(res, {
        lots: rows.map(({ lot: l, customerName, jobNumber, customerId }) => ({
          ...l,
          customerName,
          jobNumber,
          customerId,
        })),
        total,
      });
    }

    if (req.method === 'POST') {
      const { userId } = await requireAuth(req, 'admin', 'office', 'warehouse');
      let body: unknown;
      try { body = await readJson(req); }
      catch (e) {
        if (e instanceof EmptyBodyError) return jsonError(res, 400, 'INVALID_BODY', 'Empty body');
        return jsonError(res, 400, 'INVALID_BODY', 'Invalid JSON');
      }
      const parsed = CreateSchema.safeParse(body);
      if (!parsed.success) return jsonError(res, 400, 'INVALID_BODY', parsed.error.issues[0].message);

      const created = await asActor(userId, async (tx) => {
        // Reserve next lot_number for this job: max + 1, default 10
        const [maxRow] = await tx
          .select({ maxN: sql<number>`COALESCE(MAX(${lot.lotNumber}), 9) + 1` })
          .from(lot)
          .where(eq(lot.jobId, parsed.data.jobId));
        const nextLotNumber = maxRow?.maxN ?? 10;

        const [row] = await tx.insert(lot).values({
          jobId: parsed.data.jobId,
          lotNumber: nextLotNumber,
          quantity: parsed.data.quantity ?? 1,
          title: parsed.data.title ?? null,
          description: parsed.data.description ?? null,
          price: parsed.data.price ?? null,
          ref1: parsed.data.ref1 ?? null,
          ref2: parsed.data.ref2 ?? null,
          specialNotesCategory: parsed.data.specialNotesCategory ?? 'None',
          specialNotesText: parsed.data.specialNotesText ?? null,
          untested: parsed.data.untested ?? false,
          state: 'assigned',
          intakeOperatorId: userId,
        }).returning();
        return row;
      });

      return jsonOk(res, created, 201);
    }

    return methodNotAllowed(res);
  } catch (err) {
    if (err instanceof AuthError) return jsonError(res, err.status, err.code, err.message);
    console.error(err);
    return jsonError(res, 500, 'INTERNAL', 'Internal server error');
  }
}
