// api/jobs/index.ts
import type { IncomingMessage, ServerResponse } from 'node:http';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { AuthError, requireAuth } from '../_lib/auth.js';
import { readJson, EmptyBodyError } from '../_lib/body.js';
import { asActor, getDb } from '../_lib/db.js';
import { jsonError, jsonOk, methodNotAllowed } from '../_lib/responses.js';
import { job } from '../../db/schema.js';

const CreateSchema = z.object({
  customerId: z.string().uuid(),
  jobNumber: z.string().min(1).max(200),
});

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    const url = new URL(req.url ?? '', 'http://localhost');

    if (req.method === 'GET') {
      await requireAuth(req);
      const customerId = url.searchParams.get('customerId');
      const db = getDb();
      const rows = customerId
        ? await db.select().from(job).where(eq(job.customerId, customerId))
        : await db.select().from(job);
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
        const row = await asActor(userId, async (tx) => {
          const [r] = await tx.insert(job).values(parsed.data).returning();
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
