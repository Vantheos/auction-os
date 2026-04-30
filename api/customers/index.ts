// api/customers/index.ts
import type { IncomingMessage, ServerResponse } from 'node:http';
import { z } from 'zod';
import { AuthError, requireAuth } from '../_lib/auth.js';
import { readJson, EmptyBodyError } from '../_lib/body.js';
import { asActor, getDb } from '../_lib/db.js';
import { jsonError, jsonOk, methodNotAllowed } from '../_lib/responses.js';
import { customer } from '../../db/schema.js';

const CreateSchema = z.object({ name: z.string().min(1).max(200) });

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    if (req.method === 'GET') {
      await requireAuth(req);
      const rows = await getDb().select().from(customer).orderBy(customer.createdAt);
      return jsonOk(res, { customers: rows });
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
      if (!parsed.success) {
        return jsonError(res, 400, 'INVALID_BODY', parsed.error.issues[0].message);
      }
      const row = await asActor(userId, async (tx) => {
        const [r] = await tx.insert(customer).values({ name: parsed.data.name }).returning();
        return r;
      });
      return jsonOk(res, row, 201);
    }

    return methodNotAllowed(res);
  } catch (err) {
    if (err instanceof AuthError) return jsonError(res, err.status, err.code, err.message);
    console.error(err);
    return jsonError(res, 500, 'INTERNAL', 'Internal server error');
  }
}
