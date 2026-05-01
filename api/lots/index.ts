// api/lots/index.ts
import type { IncomingMessage, ServerResponse } from 'node:http';
import { z } from 'zod';
import { and, eq, sql, inArray, desc, count, gte, lte, or, isNull } from 'drizzle-orm';
import { AuthError, requireAuth } from '../_lib/auth.js';
import { readJson, EmptyBodyError } from '../_lib/body.js';
import { asActor, getDb } from '../_lib/db.js';
import { jsonError, jsonOk, methodNotAllowed } from '../_lib/responses.js';
import { customer, job, lot } from '../../db/schema.js';

async function fetchLotJoined(db: ReturnType<typeof getDb>, id: string) {
  const [row] = await db
    .select({ lot, customerName: customer.name, jobNumber: job.jobNumber, customerId: customer.id })
    .from(lot)
    .leftJoin(job, eq(lot.jobId, job.id))
    .leftJoin(customer, eq(job.customerId, customer.id))
    .where(eq(lot.id, id));
  return row ? { ...row.lot, customerName: row.customerName, jobNumber: row.jobNumber, customerId: row.customerId } : null;
}

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

const AI_STATUSES = ['success', 'partial', 'failure', 'not-run'] as const;

function parseAiStatusFilter(q: URLSearchParams): typeof AI_STATUSES[number][] | null {
  const raw = q.getAll('aiStatus');
  if (raw.length === 0) return null;
  return raw.filter((s): s is typeof AI_STATUSES[number] => (AI_STATUSES as readonly string[]).includes(s));
}

function parseDate(s: string | null): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    if (req.method === 'GET') {
      await requireAuth(req);
      const url = new URL(req.url ?? '', 'http://localhost');
      const customerId = url.searchParams.get('customerId');
      const jobId = url.searchParams.get('jobId');
      const states = parseStateFilter(url.searchParams);
      const aiStatuses = parseAiStatusFilter(url.searchParams);
      const dateFrom = parseDate(url.searchParams.get('dateFrom'));
      const dateTo = parseDate(url.searchParams.get('dateTo'));
      const limitRaw = parseInt(url.searchParams.get('limit') ?? '50', 10);
      const offsetRaw = parseInt(url.searchParams.get('offset') ?? '0', 10);
      const limit = Number.isFinite(limitRaw) && limitRaw >= 0 ? Math.min(limitRaw, 200) : 50;
      const offset = Number.isFinite(offsetRaw) && offsetRaw >= 0 ? offsetRaw : 0;

      const db = getDb();
      const conditions = [];
      if (jobId) conditions.push(eq(lot.jobId, jobId));
      if (customerId) conditions.push(eq(job.customerId, customerId));
      if (states) conditions.push(inArray(lot.state, states));
      if (aiStatuses) {
        const nonNullStatuses = aiStatuses.filter((s) => s !== 'not-run');
        const includesNotRun = aiStatuses.includes('not-run');
        const aiClauses = [];
        if (nonNullStatuses.length > 0) aiClauses.push(inArray(lot.lastAiRunStatus, nonNullStatuses));
        if (includesNotRun) aiClauses.push(isNull(lot.lastAiRunStatus));
        if (aiClauses.length > 0) {
          conditions.push(aiClauses.length === 1 ? aiClauses[0] : or(...aiClauses)!);
        }
      }
      if (dateFrom) conditions.push(gte(lot.createdAt, dateFrom));
      if (dateTo) conditions.push(lte(lot.createdAt, dateTo));

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

      try {
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
        const fresh = await fetchLotJoined(getDb(), created.id);
        return jsonOk(res, fresh ?? created, 201);
      } catch (err: unknown) {
        const e = err as { code?: string; cause?: { code?: string } };
        const pgCode = e.code ?? e.cause?.code;
        if (pgCode === '23505') {
          return jsonError(res, 409, 'LOT_NUMBER_CONFLICT', 'Another lot was just assigned this number; retry');
        }
        throw err;
      }
    }

    return methodNotAllowed(res);
  } catch (err) {
    if (err instanceof AuthError) return jsonError(res, err.status, err.code, err.message);
    console.error(err);
    return jsonError(res, 500, 'INTERNAL', 'Internal server error');
  }
}
