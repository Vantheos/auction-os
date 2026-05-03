// api/users/[id].ts
import type { IncomingMessage, ServerResponse } from 'node:http';
import { z } from 'zod';
import { and, count, eq, isNull, ne } from 'drizzle-orm';
import { AuthError, requireAuth } from '../_lib/auth.js';
import { readJson, EmptyBodyError } from '../_lib/body.js';
import { asActor, getDb } from '../_lib/db.js';
import { jsonError, jsonOk, methodNotAllowed } from '../_lib/responses.js';
import { appUser } from '../../db/schema.js';

const PatchSchema = z.object({
  role: z.enum(['admin', 'office', 'warehouse']).optional(),
  displayName: z.string().min(1).max(200).optional(),
  disabled: z.boolean().optional(),
});

function getId(req: IncomingMessage): string | null {
  const url = new URL(req.url ?? '', 'http://localhost');
  const fromQuery = url.searchParams.get('id');
  if (fromQuery) return fromQuery;
  const segments = url.pathname.split('/').filter(Boolean);
  return segments[segments.length - 1] || null;
}

/**
 * Returns true if applying `changes` to user `targetId` would leave zero
 * active admins. Covers both disable (`disabled: true`) and role-demote
 * (`role: 'office' | 'warehouse'`) — same foot-gun, same check.
 *
 * Spec §3.1 calls out "last-admin protection" with error code
 * CANNOT_DISABLE_LAST_ADMIN, but the underlying intent is generic: any
 * change that would remove the last active admin is blocked. Using a
 * single CANNOT_REMOVE_LAST_ADMIN code keeps the check + error consistent
 * across both paths.
 */
async function wouldRemoveLastActiveAdmin(
  targetId: string,
  changes: { disabled?: boolean; role?: 'admin' | 'office' | 'warehouse' },
): Promise<boolean> {
  // Skip if the change can't affect admin-active status
  if (changes.disabled === undefined && changes.role === undefined) return false;

  const db = getDb();
  const [target] = await db.select().from(appUser).where(eq(appUser.id, targetId));
  if (!target) return false; // target doesn't exist; not our problem

  const willBeAdmin = changes.role !== undefined ? changes.role === 'admin' : target.role === 'admin';
  const willBeActive = changes.disabled !== undefined ? !changes.disabled : target.disabledAt === null;
  const targetWillBeActiveAdmin = willBeAdmin && willBeActive;

  if (targetWillBeActiveAdmin) return false; // target stays an active admin

  const [{ otherActiveAdmins }] = await db
    .select({ otherActiveAdmins: count() })
    .from(appUser)
    .where(and(eq(appUser.role, 'admin'), isNull(appUser.disabledAt), ne(appUser.id, targetId)));

  return otherActiveAdmins === 0;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    const id = getId(req);
    if (!id) return jsonError(res, 400, 'INVALID_REQUEST', 'Missing user id');

    if (req.method === 'PATCH') {
      const { userId } = await requireAuth(req, 'admin');
      let body: unknown;
      try {
        body = await readJson(req);
      } catch (e) {
        if (e instanceof EmptyBodyError) return jsonError(res, 400, 'INVALID_BODY', 'Empty body');
        return jsonError(res, 400, 'INVALID_BODY', 'Invalid JSON');
      }
      const parsed = PatchSchema.safeParse(body);
      if (!parsed.success) return jsonError(res, 400, 'INVALID_BODY', parsed.error.issues[0].message);

      // Self-disable rejection — admins cannot lock themselves out.
      // Same rule will apply to hard delete if/when it lands (out of scope
      // for Phase 4 per spec §3.2).
      if (parsed.data.disabled === true && id === userId) {
        return jsonError(res, 403, 'CANNOT_DISABLE_SELF', 'You cannot disable your own account');
      }

      // Last-admin protection — generic across disable + role-demote.
      if (await wouldRemoveLastActiveAdmin(id, parsed.data)) {
        return jsonError(res, 403, 'CANNOT_REMOVE_LAST_ADMIN', 'Cannot remove the last active admin');
      }

      const update: Record<string, unknown> = { updatedAt: new Date() };
      if (parsed.data.role !== undefined) update.role = parsed.data.role;
      if (parsed.data.displayName !== undefined) update.displayName = parsed.data.displayName;
      if (parsed.data.disabled !== undefined) {
        update.disabledAt = parsed.data.disabled ? new Date() : null;
      }

      const row = await asActor(userId, async (tx) => {
        const [r] = await tx.update(appUser).set(update).where(eq(appUser.id, id)).returning();
        return r;
      });
      if (!row) return jsonError(res, 404, 'NOT_FOUND', 'User not found');
      return jsonOk(res, row);
    }

    return methodNotAllowed(res);
  } catch (err) {
    if (err instanceof AuthError) return jsonError(res, err.status, err.code, err.message);
    console.error(err);
    return jsonError(res, 500, 'INTERNAL', 'Internal server error');
  }
}
