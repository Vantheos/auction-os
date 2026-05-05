// api/jobs/[id]/export-af360/batch.ts
//
// Phase 5 Area 5 — Step 2 of the AF360 export flow. Builds a single image
// zip for one batch of lots: fetches each lot's photos from Supabase Storage
// (with the existing display transform applied to bound egress), pipes them
// through `archiver` in store mode (no compression — JPEGs already
// compressed), uploads the resulting zip to Vercel Blob with `addRandomSuffix:
// false` so re-export overwrites cleanly, and returns the signed URL for
// the client to trigger a native browser download.
//
// Auth: admin or office. Warehouse cannot export.
//
// See spec docs/superpowers/specs/2026-05-04-phase-5-design.md §3.5.

import type { IncomingMessage, ServerResponse } from 'node:http';
import { z } from 'zod';
import { and, asc, eq, inArray } from 'drizzle-orm';
import archiver from 'archiver';
import { put } from '@vercel/blob';
import { AuthError, requireAuth } from '../../../_lib/auth.js';
import { readJson, EmptyBodyError } from '../../../_lib/body.js';
import { getDb } from '../../../_lib/db.js';
import { jsonError, jsonOk, methodNotAllowed } from '../../../_lib/responses.js';
import { lot, lotPhoto } from '../../../../db/schema.js';
import { downloadPhotoTransformed } from '../../../_lib/storage.js';
import type { ExportBatchResponse } from '../../../../shared/types.js';

const BatchSchema = z.object({
  batchNum: z.number().int().positive(),
  lotIds: z.array(z.string().uuid()).min(1).max(100),
  exportLabel: z.string().min(1).max(200),
  totalBatches: z.number().int().positive(),
});

// Photo fetch parallelism — 50 concurrent fetches keeps the pipeline busy
// without overwhelming Supabase's per-request rate limits.
const FETCH_CONCURRENCY = 50;

// Display transform shared with the cataloging UI. ~15× egress reduction vs.
// originals; visual quality more than sufficient for AF360 / HiBid display.
const EXPORT_TRANSFORM = { width: 1568, quality: 80, resize: 'contain' as const };

const BLOB_PREFIX = 'exports';

function getId(req: IncomingMessage): string | null {
  const url = new URL(req.url ?? '', 'http://localhost');
  const fromQuery = url.searchParams.get('id');
  if (fromQuery) return fromQuery;
  const segs = url.pathname.split('/').filter(Boolean);
  return segs.length >= 5 ? segs[2] : null;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    if (req.method !== 'POST') return methodNotAllowed(res);

    await requireAuth(req, 'admin', 'office');

    const jobId = getId(req);
    if (!jobId) return jsonError(res, 400, 'INVALID_REQUEST', 'Missing job id');

    let body: unknown;
    try {
      body = await readJson(req);
    } catch (e) {
      if (e instanceof EmptyBodyError) return jsonError(res, 400, 'INVALID_BODY', 'Empty body');
      return jsonError(res, 400, 'INVALID_BODY', 'Invalid JSON');
    }

    const parsed = BatchSchema.safeParse(body);
    if (!parsed.success) return jsonError(res, 400, 'INVALID_BODY', parsed.error.issues[0].message);

    const { batchNum, lotIds, exportLabel, totalBatches } = parsed.data;
    const db = getDb();

    // Defense against tampered batch payloads: every lotId must (a) exist,
    // (b) belong to this job, (c) be in 'assigned' state.
    const lotsForBatch = await db
      .select()
      .from(lot)
      .where(and(eq(lot.jobId, jobId), eq(lot.state, 'assigned'), inArray(lot.id, lotIds)))
      .orderBy(asc(lot.lotNumber));

    if (lotsForBatch.length !== lotIds.length) {
      return jsonError(
        res,
        400,
        'INVALID_LOT_IDS',
        'One or more lotIds do not belong to this job, are not assigned, or do not exist.',
      );
    }

    // Query photos for these lots, uploaded only, ordered by display position.
    const photos = await db
      .select()
      .from(lotPhoto)
      .where(and(inArray(lotPhoto.lotId, lotIds), eq(lotPhoto.status, 'uploaded')))
      .orderBy(asc(lotPhoto.lotId), asc(lotPhoto.displayOrder));

    // Reject non-JPEG photos (per AF360 spec — only .jpg/.jpeg/.png; we ship
    // JPEG only in v1). Surfaces the affected lot numbers so the user can
    // re-upload before retrying just this batch.
    const lotByLotId = new Map(lotsForBatch.map((l) => [l.id, l]));
    const badLotNumbers = new Set<number>();
    for (const p of photos) {
      const path = p.storagePath.toLowerCase();
      if (!path.endsWith('.jpg') && !path.endsWith('.jpeg')) {
        const ln = lotByLotId.get(p.lotId)?.lotNumber;
        if (typeof ln === 'number') badLotNumbers.add(ln);
      }
    }
    if (badLotNumbers.size > 0) {
      const list = [...badLotNumbers].sort((a, b) => a - b).join(', ');
      return jsonError(
        res,
        500,
        'EXPORT_FAILED',
        `Some lots have unsupported photo formats: ${list}.`,
      );
    }

    // Group photos by lotId so we can compute filenames per AF360 convention:
    // 1 photo on lot     → "{lotNumber}.jpg"
    // 2+ photos on lot   → "{lotNumber}-{order}.jpg" (order = 1-indexed display position)
    const photosByLot = new Map<string, typeof photos>();
    for (const p of photos) {
      const existing = photosByLot.get(p.lotId);
      if (existing) existing.push(p);
      else photosByLot.set(p.lotId, [p]);
    }

    // Build (lotNumber, photo, filename) tuples.
    type PhotoEntry = { storagePath: string; filename: string };
    const entries: PhotoEntry[] = [];
    for (const l of lotsForBatch) {
      const lotPhotos = photosByLot.get(l.id) ?? [];
      const lotNumber = l.lotNumber;
      if (lotNumber == null) continue; // assigned lots always have a number, but be defensive
      if (lotPhotos.length === 1) {
        entries.push({
          storagePath: lotPhotos[0].storagePath,
          filename: `${lotNumber}.jpg`,
        });
      } else {
        for (let i = 0; i < lotPhotos.length; i++) {
          entries.push({
            storagePath: lotPhotos[i].storagePath,
            filename: `${lotNumber}-${i + 1}.jpg`,
          });
        }
      }
    }

    // Fetch photos with bounded parallelism, then append to the zip in
    // entry order so the zip's directory matches expected filenames.
    type FetchedPhoto = { filename: string; buffer: Buffer };
    const fetched: FetchedPhoto[] = new Array(entries.length);
    let cursor = 0;
    async function worker() {
      while (true) {
        const i = cursor++;
        if (i >= entries.length) return;
        const e = entries[i];
        const buf = await downloadPhotoTransformed(e.storagePath, EXPORT_TRANSFORM);
        fetched[i] = { filename: e.filename, buffer: buf };
      }
    }
    const workers = Array.from({ length: Math.min(FETCH_CONCURRENCY, entries.length) }, () => worker());
    await Promise.all(workers);

    // Build zip stream (store mode — no compression on already-compressed JPEGs).
    const archive = archiver('zip', { store: true });
    for (const f of fetched) {
      if (!f) continue; // shouldn't happen; defensive
      archive.append(f.buffer, { name: f.filename });
    }
    // archiver.finalize() returns a promise that resolves when the stream
    // is closed; we don't await it directly because put() consumes the
    // stream concurrently.
    void archive.finalize();

    const zipFilename = `${exportLabel}-batch-${batchNum}-of-${totalBatches}.zip`;
    const blobPath = `${BLOB_PREFIX}/${jobId}/${zipFilename}`;
    // addRandomSuffix:false keeps the path stable per export. allowOverwrite:true
    // is required by @vercel/blob >= v1.x — without it, a re-export of the same
    // job throws because the prior batch zip still exists in the bucket.
    const blob = await put(blobPath, archive, {
      access: 'public',
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: 'application/zip',
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const response: ExportBatchResponse = {
      downloadUrl: blob.url,
      expiresAt,
      batchNum,
      totalBatches,
      filename: zipFilename,
      photoCount: fetched.length,
    };
    return jsonOk(res, response);
  } catch (err) {
    if (err instanceof AuthError) return jsonError(res, err.status, err.code, err.message);
    console.error(err);
    return jsonError(res, 500, 'INTERNAL', 'Internal server error');
  }
}
