// api/jobs/index.ts
import type { IncomingMessage, ServerResponse } from 'node:http';
import { z } from 'zod';
import { sql } from 'drizzle-orm';
import { AuthError, requireAuth } from '../_lib/auth.js';
import { readJson, EmptyBodyError } from '../_lib/body.js';
import { asActor, getDb } from '../_lib/db.js';
import { jsonError, jsonOk, methodNotAllowed } from '../_lib/responses.js';
import { job } from '../../db/schema.js';

// Phase 5: startBid stored as numeric(10,2); accepted as decimal string
// matching the same regex used for lot.price. shippable boolean.
const CURRENCY_REGEX = /^\d+(\.\d{1,2})?$/;
const CreateSchema = z.object({
  customerId: z.string().uuid(),
  jobNumber: z.string().min(1).max(200),
  startBid: z.string().regex(CURRENCY_REGEX, 'startBid must be a positive decimal').optional(),
  shippable: z.boolean().optional(),
});

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    const url = new URL(req.url ?? '', 'http://localhost');

    if (req.method === 'GET') {
      await requireAuth(req);
      const customerId = url.searchParams.get('customerId');
      const db = getDb();
      // LEFT JOIN + GROUP BY to compute per-job lot counts in a single
      // round-trip (avoiding N+1 on the customer detail page). Aliases
      // are quoted so Postgres preserves camelCase in the result keys.
      // assignedLotCount / totalLotCount / exportReadyLotCount mirror
      // GET /api/jobs/:id and feed the AF360 export button gate, which
      // surfaces in the customer's job list as well as Inventory.
      const rows = await db.execute<{
        id: string;
        customerId: string;
        jobNumber: string;
        closedAt: Date | null;
        startBid: string;
        shippable: boolean;
        createdAt: Date;
        updatedAt: Date;
        assignedLotCount: number;
        totalLotCount: number;
        exportReadyLotCount: number;
      }>(sql`
        SELECT j.id,
               j.customer_id          AS "customerId",
               j.job_number           AS "jobNumber",
               j.closed_at            AS "closedAt",
               j.start_bid            AS "startBid",
               j.shippable,
               j.created_at           AS "createdAt",
               j.updated_at           AS "updatedAt",
               COALESCE(SUM(CASE WHEN l.state = 'assigned' THEN 1 ELSE 0 END), 0)::int AS "assignedLotCount",
               COUNT(l.id)::int       AS "totalLotCount",
               COALESCE(SUM(CASE
                 WHEN l.state = 'assigned'
                  AND l.title IS NOT NULL AND l.title <> ''
                  AND l.description IS NOT NULL AND l.description <> ''
                  AND l.price IS NOT NULL
                 THEN 1 ELSE 0 END), 0)::int AS "exportReadyLotCount"
          FROM job j
          LEFT JOIN lot l ON l.job_id = j.id
         ${customerId ? sql`WHERE j.customer_id = ${customerId}` : sql``}
         GROUP BY j.id
         ORDER BY j.created_at DESC
      `);
      return jsonOk(res, { jobs: rows });
    }

    if (req.method === 'POST') {
      const { userId } = await requireAuth(req, 'admin', 'office');
      let body: unknown;
      try {
        body = await readJson(req);
      } catch (e) {
        if (e instanceof EmptyBodyError) return jsonError(res, 400, 'INVALID_BODY', 'Empty body');
        return jsonError(res, 400, 'INVALID_BODY', 'Invalid JSON');
      }
      const parsed = CreateSchema.safeParse(body);
      if (!parsed.success) return jsonError(res, 400, 'INVALID_BODY', parsed.error.issues[0].message);

      try {
        // Build insert payload explicitly so undefined optional fields fall
        // through to the column defaults (start_bid=5.00, shippable=false)
        // rather than getting passed as undefined and bypassing them.
        const row = await asActor(userId, async (tx) => {
          const base = {
            customerId: parsed.data.customerId,
            jobNumber: parsed.data.jobNumber,
          };
          const insertValues = {
            ...base,
            ...(parsed.data.startBid !== undefined ? { startBid: parsed.data.startBid } : {}),
            ...(parsed.data.shippable !== undefined ? { shippable: parsed.data.shippable } : {}),
          };
          const [r] = await tx.insert(job).values(insertValues).returning();
          return r;
        });
        return jsonOk(res, row, 201);
      } catch (err: unknown) {
        const e = err as { code?: string; cause?: { code?: string } };
        const pgCode = e.code ?? e.cause?.code;
        if (pgCode === '23505') {
          return jsonError(res, 409, 'DUPLICATE_JOB_NUMBER', 'A job with that number already exists for this customer');
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
