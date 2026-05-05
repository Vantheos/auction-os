// api/customers/[id].ts
import type { IncomingMessage, ServerResponse } from 'node:http';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { AuthError, requireAuth } from '../_lib/auth.js';
import { readJson, EmptyBodyError } from '../_lib/body.js';
import { asActor, getDb } from '../_lib/db.js';
import { jsonError, jsonOk, methodNotAllowed } from '../_lib/responses.js';
import { customer } from '../../db/schema.js';

const UpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  sellerCode: z.string().min(1).max(50).optional(),
  disabled: z.boolean().optional(),
});

function getId(req: IncomingMessage): string | null {
  // Vercel rewrite: /api/customers/<id> → /api/customers/[id]?id=<id>
  // We parse the URL to retrieve it.
  const url = new URL(req.url ?? '', 'http://localhost');
  const fromQuery = url.searchParams.get('id');
  if (fromQuery) return fromQuery;
  // Fallback: parse trailing path segment if no query (e.g. test calls)
  const segments = url.pathname.split('/').filter(Boolean);
  return segments[segments.length - 1] || null;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    const id = getId(req);
    if (!id) return jsonError(res, 400, 'INVALID_REQUEST', 'Missing customer id');

    if (req.method === 'GET') {
      await requireAuth(req);
      const [row] = await getDb().select().from(customer).where(eq(customer.id, id));
      if (!row) return jsonError(res, 404, 'NOT_FOUND', 'Customer not found');
      return jsonOk(res, row);
    }

    if (req.method === 'PATCH') {
      const { userId } = await requireAuth(req, 'admin', 'office');
      let body: unknown;
      try {
        body = await readJson(req);
      } catch (e) {
        if (e instanceof EmptyBodyError) return jsonError(res, 400, 'INVALID_BODY', 'Empty body');
        return jsonError(res, 400, 'INVALID_BODY', 'Invalid JSON');
      }
      const parsed = UpdateSchema.safeParse(body);
      if (!parsed.success) return jsonError(res, 400, 'INVALID_BODY', parsed.error.issues[0].message);
      // `disabled` is the request-shape boolean toggle. Translate to
      // disabledAt timestamp for the column write; never store `disabled`
      // directly. Other fields (name, sellerCode) pass through.
      const { disabled, ...rest } = parsed.data;
      const updateValues: Record<string, unknown> = { ...rest, updatedAt: new Date() };
      if (disabled === true) updateValues.disabledAt = new Date();
      else if (disabled === false) updateValues.disabledAt = null;
      const row = await asActor(userId, async (tx) => {
        const [r] = await tx
          .update(customer)
          .set(updateValues)
          .where(eq(customer.id, id))
          .returning();
        return r;
      });
      if (!row) return jsonError(res, 404, 'NOT_FOUND', 'Customer not found');
      return jsonOk(res, row);
    }

    if (req.method === 'DELETE') {
      const { userId } = await requireAuth(req, 'admin');
      const row = await asActor(userId, async (tx) => {
        const [r] = await tx.delete(customer).where(eq(customer.id, id)).returning();
        return r;
      });
      if (!row) return jsonError(res, 404, 'NOT_FOUND', 'Customer not found');
      return jsonOk(res, { ok: true });
    }

    return methodNotAllowed(res);
  } catch (err) {
    if (err instanceof AuthError) return jsonError(res, err.status, err.code, err.message);
    console.error(err);
    return jsonError(res, 500, 'INTERNAL', 'Internal server error');
  }
}
