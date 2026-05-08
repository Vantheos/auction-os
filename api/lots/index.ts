// api/lots/index.ts
import type { IncomingMessage, ServerResponse } from 'node:http';
import { z } from 'zod';
import { and, eq, sql, inArray, desc, count, gte, lte, or, isNull, ilike } from 'drizzle-orm';
import { AuthError, requireAuth } from '../_lib/auth.js';
import { readJson, EmptyBodyError } from '../_lib/body.js';
import { asActor, getDb } from '../_lib/db.js';
import { jsonError, jsonOk, methodNotAllowed } from '../_lib/responses.js';
import { pgCodeOf, PG_UNIQUE_VIOLATION } from '../_lib/pg-errors.js';
import { signUploadUrl, bulkSignReadUrls } from '../_lib/storage.js';
import { customer, job, lot, lotPhoto } from '../../db/schema.js';

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
  // Phase 3: when present, atomically create the first lot_photo row + return
  // a signed upload URL in the same transaction. Cataloging always passes this.
  firstPhoto: z.object({ displayOrder: z.literal(1) }).optional(),
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
      // REQ-1 (2026-05-06): the legacy ?needsInfo=true filter was split into
      // two independent chips. ?awaitingAi=true catches lots where AI hasn't
      // produced output yet; ?needsReview=true catches lots whose AI output
      // didn't fully succeed (partial/failure) OR succeeded but a required
      // field is empty (e.g. operator cleared one). Both chips active = OR.
      // Backward-compat: ?needsInfo=true still parses and behaves like the
      // old union (awaitingAi OR needsReview) so external links don't break.
      const awaitingAi = url.searchParams.get('awaitingAi') === 'true';
      const needsReview = url.searchParams.get('needsReview') === 'true';
      const legacyNeedsInfo = url.searchParams.get('needsInfo') === 'true';
      // Free-text search across title + description, case-insensitive ILIKE
      // OR'd. Whitespace-only is treated as no filter. SQL wildcards (% _)
      // pass through and broaden the match — acceptable behavior for an
      // operator-facing search; revisit if it causes confusion.
      const search = (url.searchParams.get('search') ?? '').trim() || null;
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
      // Awaiting AI: status NULL AND state allows AI processing AND at
      // least one of title / description / price is empty. Mirrors the
      // eligibility query in /api/ai/backlog and the pending-AI badge in
      // /api/system-settings — all three define "awaiting AI" the same
      // way, so an operator-completed lot (all three fields filled at
      // catalog time, AI never ran) doesn't show up here. Empty = NULL
      // or '' for text; NULL only for price.
      const awaitingAiClause = and(
        isNull(lot.lastAiRunStatus),
        inArray(lot.state, ['assigned', 'unassigned'] as const),
        or(
          isNull(lot.title),
          sql`${lot.title} = ''`,
          isNull(lot.description),
          sql`${lot.description} = ''`,
          isNull(lot.price),
        )!,
      )!;
      // Needs review: AI ran but didn't fully succeed (partial/failure),
      // OR AI ran successfully but a required user-facing field is now
      // empty (operator cleared title/description/price after the run).
      // The empty-fields branch is gated by lastAiRunStatus IS NOT NULL —
      // a status=NULL lot is "awaiting AI" territory, not "needs review."
      // Empty = NULL or '' for text; NULL only for price (zero is operator
      // intent, not "missing").
      const needsReviewClause = or(
        inArray(lot.lastAiRunStatus, ['partial', 'failure'] as const),
        and(
          sql`${lot.lastAiRunStatus} IS NOT NULL`,
          inArray(lot.state, ['assigned', 'unassigned'] as const),
          or(
            isNull(lot.title),
            sql`${lot.title} = ''`,
            isNull(lot.description),
            sql`${lot.description} = ''`,
            isNull(lot.price),
          ),
        )!,
      )!;
      if (legacyNeedsInfo) {
        conditions.push(or(awaitingAiClause, needsReviewClause)!);
      } else if (awaitingAi && needsReview) {
        conditions.push(or(awaitingAiClause, needsReviewClause)!);
      } else if (awaitingAi) {
        conditions.push(awaitingAiClause);
      } else if (needsReview) {
        conditions.push(needsReviewClause);
      }
      if (dateFrom) conditions.push(gte(lot.createdAt, dateFrom));
      if (dateTo) conditions.push(lte(lot.createdAt, dateTo));
      if (search) {
        conditions.push(or(
          ilike(lot.title, `%${search}%`),
          ilike(lot.description, `%${search}%`),
        )!);
      }

      const where = conditions.length > 0 ? and(...conditions) : undefined;

      // Subquery: cover photo (display_order = 1) per lot, when status = 'uploaded'.
      // Pending or failed covers are excluded — there's no Storage object to sign yet.
      const coverSub = db
        .select({ lotId: lotPhoto.lotId, storagePath: lotPhoto.storagePath })
        .from(lotPhoto)
        .where(and(eq(lotPhoto.displayOrder, 1), eq(lotPhoto.status, 'uploaded')))
        .as('cover');

      const rows = await db
        .select({
          lot,
          customerName: customer.name,
          jobNumber: job.jobNumber,
          customerId: customer.id,
          coverPath: coverSub.storagePath,
        })
        .from(lot)
        .leftJoin(job, eq(lot.jobId, job.id))
        .leftJoin(customer, eq(job.customerId, customer.id))
        .leftJoin(coverSub, eq(coverSub.lotId, lot.id))
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

      // Bulk-sign cover read URLs (~300 px thumbnail). Best-effort: paths that
      // fail to sign get null on the response, client falls back to placeholder.
      const coverPaths = rows.map((r) => r.coverPath).filter((p): p is string => !!p);
      const signed = coverPaths.length > 0
        ? await bulkSignReadUrls(coverPaths, { width: 300, quality: 80 })
        : new Map<string, string>();

      return jsonOk(res, {
        lots: rows.map(({ lot: l, customerName, jobNumber, customerId, coverPath }) => ({
          ...l,
          customerName,
          jobNumber,
          customerId,
          coverSignedUrl: coverPath ? signed.get(coverPath) ?? null : null,
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
          // Serialize lot_number allocation per job. The advisory lock is held
          // for the duration of the transaction; concurrent POSTs for the same
          // job queue rather than collide on the partial unique index. The
          // existing 409 LOT_NUMBER_CONFLICT path stays as defense-in-depth.
          await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${parsed.data.jobId}))`);

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

          // Atomic first-photo creation: when the cataloging client passes
          // firstPhoto: { displayOrder: 1 }, insert a pending lot_photo row in
          // the same transaction. Avoids the orphan window between lot insert
          // and first photo insert.
          let firstPhoto: { id: string; storagePath: string } | null = null;
          if (parsed.data.firstPhoto) {
            const photoId = crypto.randomUUID();
            const storagePath = `lots/${row.id}/${photoId}.jpg`;
            const [photoRow] = await tx.insert(lotPhoto).values({
              id: photoId,
              lotId: row.id,
              storagePath,
              displayOrder: 1,
              status: 'pending',
              capturedBy: userId,
            }).returning();
            firstPhoto = { id: photoRow.id, storagePath: photoRow.storagePath };
          }

          return { lot: row, firstPhoto };
        });

        // Sign upload URL outside the transaction (it makes a network call to
        // Supabase Storage; doing it inside would hold the lock longer).
        let firstPhoto: Record<string, unknown> | null = null;
        if (created.firstPhoto) {
          const { uploadUrl, token } = await signUploadUrl(created.firstPhoto.storagePath);
          firstPhoto = {
            id: created.firstPhoto.id,
            lotId: created.lot.id,
            storagePath: created.firstPhoto.storagePath,
            displayOrder: 1,
            status: 'pending',
            uploadUrl,
            token,
          };
        }

        const fresh = await fetchLotJoined(getDb(), created.lot.id);
        return jsonOk(res, { ...(fresh ?? created.lot), firstPhoto }, 201);
      } catch (err: unknown) {
        if (pgCodeOf(err) === PG_UNIQUE_VIOLATION) {
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
