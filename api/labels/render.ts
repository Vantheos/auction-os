import type { IncomingMessage, ServerResponse } from 'node:http';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { AuthError, requireAuth } from '../_lib/auth.js';
import { readJson, EmptyBodyError } from '../_lib/body.js';
import { getDb } from '../_lib/db.js';
import { jsonError, jsonOk, methodNotAllowed } from '../_lib/responses.js';
import { customer, job, lot } from '../../db/schema.js';
import { renderZpl } from '../_lib/label-render.js';

const Schema = z.object({ lotId: z.string().uuid() });

function deployHost(): string {
  const explicit = process.env.PUBLIC_DEPLOY_URL;
  if (explicit) return explicit.replace(/\/$/, '');
  const vercel = process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`;
  return 'http://localhost:5173';
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    if (req.method !== 'POST') return methodNotAllowed(res);
    await requireAuth(req, 'admin', 'office', 'warehouse');
    let body: unknown;
    try { body = await readJson(req); }
    catch (e) {
      if (e instanceof EmptyBodyError) return jsonError(res, 400, 'INVALID_BODY', 'Empty body');
      return jsonError(res, 400, 'INVALID_BODY', 'Invalid JSON');
    }
    const parsed = Schema.safeParse(body);
    if (!parsed.success) return jsonError(res, 400, 'INVALID_BODY', parsed.error.issues[0].message);

    const [row] = await getDb()
      .select({ lot, customerName: customer.name, jobNumber: job.jobNumber })
      .from(lot)
      .leftJoin(job, eq(lot.jobId, job.id))
      .leftJoin(customer, eq(job.customerId, customer.id))
      .where(eq(lot.id, parsed.data.lotId));

    if (!row) return jsonError(res, 404, 'NOT_FOUND', 'Lot not found');
    if (!row.lot.lotNumber || !row.customerName || !row.jobNumber) {
      return jsonError(res, 422, 'NOT_LABELLABLE', 'Lot has no auction assignment to label');
    }

    const zpl = await renderZpl({
      id: row.lot.id,
      lotNumber: row.lot.lotNumber,
      customerName: row.customerName,
      jobNumber: row.jobNumber,
    }, deployHost());

    // Operator initiated a label render — assume they intend to print.
    // Clear the reprint-needed flag so the pill comes off the row. If
    // the Browser Print POST fails on the client, they'll retry; if
    // they never finish, the flag stays cleared (operator error, not
    // worth complicating the flow with a separate "print confirmed"
    // round-trip).
    if (row.lot.labelReprintNeeded) {
      await getDb().update(lot)
        .set({ labelReprintNeeded: false, updatedAt: new Date() })
        .where(eq(lot.id, parsed.data.lotId));
    }

    return jsonOk(res, { zpl });
  } catch (err) {
    if (err instanceof AuthError) return jsonError(res, err.status, err.code, err.message);
    console.error(err);
    return jsonError(res, 500, 'INTERNAL', 'Internal server error');
  }
}
