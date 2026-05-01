// api/lots/export.ts
import type { IncomingMessage, ServerResponse } from 'node:http';
import { eq, and, desc, inArray, gte, lte, or, isNull } from 'drizzle-orm';
import { AuthError, requireAuth } from '../_lib/auth.js';
import { getDb } from '../_lib/db.js';
import { jsonError, methodNotAllowed } from '../_lib/responses.js';
import { customer, job, lot } from '../../db/schema.js';

const COLUMNS = [
  'id', 'customer', 'job', 'lot_number', 'state', 'title', 'description',
  'price', 'special_notes_category', 'special_notes_text', 'untested',
  'quantity', 'ai_status', 'created_at', 'updated_at',
];

const STATES = ['assigned', 'unassigned', 'sold', 'picked-up', 'not-sellable'] as const;
const AI_STATUSES = ['success', 'partial', 'failure', 'not-run'] as const;

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = v instanceof Date ? v.toISOString() : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function parseDate(s: string | null): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    if (req.method !== 'POST') return methodNotAllowed(res);
    await requireAuth(req, 'admin', 'office');

    const url = new URL(req.url ?? '', 'http://localhost');
    const customerId = url.searchParams.get('customerId');
    const jobId = url.searchParams.get('jobId');
    const stateFilter = url.searchParams.getAll('state').filter((s): s is typeof STATES[number] =>
      (STATES as readonly string[]).includes(s)
    );
    const aiStatusRaw = url.searchParams.getAll('aiStatus').filter((s): s is typeof AI_STATUSES[number] =>
      (AI_STATUSES as readonly string[]).includes(s)
    );
    const dateFrom = parseDate(url.searchParams.get('dateFrom'));
    const dateTo = parseDate(url.searchParams.get('dateTo'));

    const conditions = [];
    if (customerId) conditions.push(eq(job.customerId, customerId));
    if (jobId) conditions.push(eq(lot.jobId, jobId));
    if (stateFilter.length > 0) conditions.push(inArray(lot.state, stateFilter));
    if (aiStatusRaw.length > 0) {
      const nonNull = aiStatusRaw.filter((s) => s !== 'not-run');
      const includesNotRun = aiStatusRaw.includes('not-run');
      const aiClauses = [];
      if (nonNull.length > 0) aiClauses.push(inArray(lot.lastAiRunStatus, nonNull));
      if (includesNotRun) aiClauses.push(isNull(lot.lastAiRunStatus));
      if (aiClauses.length > 0) {
        conditions.push(aiClauses.length === 1 ? aiClauses[0] : or(...aiClauses)!);
      }
    }
    if (dateFrom) conditions.push(gte(lot.createdAt, dateFrom));
    if (dateTo) conditions.push(lte(lot.createdAt, dateTo));

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = await getDb()
      .select({
        lot,
        customerName: customer.name,
        jobNumber: job.jobNumber,
      })
      .from(lot)
      .leftJoin(job, eq(lot.jobId, job.id))
      .leftJoin(customer, eq(job.customerId, customer.id))
      .where(where)
      .orderBy(desc(lot.createdAt));

    const lines = [COLUMNS.join(',')];
    for (const { lot: l, customerName, jobNumber } of rows) {
      lines.push([
        csvCell(l.id), csvCell(customerName), csvCell(jobNumber), csvCell(l.lotNumber),
        csvCell(l.state), csvCell(l.title), csvCell(l.description), csvCell(l.price),
        csvCell(l.specialNotesCategory), csvCell(l.specialNotesText), csvCell(l.untested),
        csvCell(l.quantity), csvCell(l.lastAiRunStatus), csvCell(l.createdAt), csvCell(l.updatedAt),
      ].join(','));
    }
    const body = lines.join('\n');

    res.statusCode = 200;
    res.setHeader('content-type', 'text/csv; charset=utf-8');
    res.setHeader('content-disposition', `attachment; filename="lots-${Date.now()}.csv"`);
    res.end(body);
  } catch (err) {
    if (err instanceof AuthError) return jsonError(res, err.status, err.code, err.message);
    console.error(err);
    return jsonError(res, 500, 'INTERNAL', 'Internal server error');
  }
}
