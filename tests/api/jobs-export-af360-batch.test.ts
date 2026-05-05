// tests/api/jobs-export-af360-batch.test.ts
// Phase 5 Area 5 — Step 2 endpoint: fetches photos, builds zip, uploads
// to Vercel Blob. Storage download + Vercel Blob put are mocked at module
// boundaries so tests don't depend on external services.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { testDb, truncateAll } from '../helpers/test-db';
import { mintTestJwt } from '../helpers/test-jwt';
import { callHandler, type CallResult } from '../helpers/call-handler';
import { appUser, customer, job, lot, lotPhoto } from '../../db/schema';

// Mock storage download — return a fake JPEG buffer for any path.
vi.mock('../../api/_lib/storage.js', async () => {
  const actual = await vi.importActual<typeof import('../../api/_lib/storage')>('../../api/_lib/storage');
  return {
    ...actual,
    downloadPhotoTransformed: vi.fn(async (_path: string) => Buffer.from('FAKE-JPEG-BYTES')),
  };
});

// Mock @vercel/blob put — return a deterministic URL based on the path.
vi.mock('@vercel/blob', () => ({
  put: vi.fn(async (path: string) => ({ url: `https://blob.vercel-storage.com/${path}` })),
}));

// Imported AFTER mocks so the handler picks them up.
const { default: batchHandler } = await import('../../api/jobs/[id]/export-af360/batch');

const ADMIN = '00000000-0000-0000-0000-000000000001';
const OFFICE = '00000000-0000-0000-0000-000000000002';
const WAREHOUSE = '00000000-0000-0000-0000-000000000003';

type SeedOpts = {
  lotsWithPhotos?: { lotNumber: number; photoFilenames: string[] }[];
  // If true, mark some photos as `pending` to verify they're filtered out.
  includePendingPhotos?: boolean;
};

async function seedFixture(opts: SeedOpts = {}): Promise<{
  jobId: string;
  lotIds: string[];
}> {
  await testDb.insert(appUser).values([
    { id: ADMIN, role: 'admin', displayName: 'Admin' },
    { id: OFFICE, role: 'office', displayName: 'Office' },
    { id: WAREHOUSE, role: 'warehouse', displayName: 'Warehouse' },
  ]);
  const [c] = await testDb
    .insert(customer)
    .values({ name: 'Acme Auctions', sellerCode: 'ACME001' })
    .returning();
  const [j] = await testDb
    .insert(job)
    .values({ customerId: c.id, jobNumber: 'JOB-001' })
    .returning();

  const lotsWithPhotos = opts.lotsWithPhotos ?? [
    { lotNumber: 1, photoFilenames: ['p1.jpg'] },
    { lotNumber: 2, photoFilenames: ['p1.jpg', 'p2.jpg', 'p3.jpg'] },
  ];

  const lotIds: string[] = [];
  for (const spec of lotsWithPhotos) {
    const [l] = await testDb
      .insert(lot)
      .values({
        jobId: j.id,
        lotNumber: spec.lotNumber,
        title: `Lot ${spec.lotNumber}`,
        description: 'Description',
        quantity: 1,
        state: 'assigned' as const,
        source: 'imported' as const,
        intakeOperatorId: ADMIN,
      })
      .returning();
    lotIds.push(l.id);

    for (let i = 0; i < spec.photoFilenames.length; i++) {
      await testDb.insert(lotPhoto).values({
        lotId: l.id,
        storagePath: `lots/${l.id}/${spec.photoFilenames[i]}`,
        displayOrder: i + 1,
        status: 'uploaded' as const,
        capturedBy: ADMIN,
      });
    }

    if (opts.includePendingPhotos) {
      await testDb.insert(lotPhoto).values({
        lotId: l.id,
        storagePath: `lots/${l.id}/pending.jpg`,
        displayOrder: spec.photoFilenames.length + 1,
        status: 'pending' as const,
        capturedBy: ADMIN,
      });
    }
  }
  return { jobId: j.id, lotIds };
}

async function callBatch(
  jobId: string,
  body: unknown,
  role: 'admin' | 'office' | 'warehouse' = 'admin',
  userId = ADMIN,
): Promise<CallResult<any>> {
  const token = await mintTestJwt({ userId, role });
  return callHandler(batchHandler, {
    method: 'POST',
    url: `/api/jobs/${jobId}/export-af360/batch?id=${jobId}`,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body,
  });
}

describe('POST /api/jobs/:id/export-af360/batch', () => {
  beforeEach(async () => { await truncateAll(); });

  it('admin builds a zip and returns a Vercel Blob URL', async () => {
    const { jobId, lotIds } = await seedFixture();
    const res = await callBatch(jobId, {
      batchNum: 1,
      lotIds,
      exportLabel: 'JobExport-test-001',
      totalBatches: 1,
    });

    expect(res.status).toBe(200);
    expect(res.body.batchNum).toBe(1);
    expect(res.body.totalBatches).toBe(1);
    expect(res.body.filename).toBe('JobExport-test-001-batch-1-of-1.zip');
    expect(res.body.downloadUrl).toContain('JobExport-test-001-batch-1-of-1.zip');
    // Lot 1 = 1 photo, Lot 2 = 3 photos → 4 total
    expect(res.body.photoCount).toBe(4);
    expect(typeof res.body.expiresAt).toBe('string');
  });

  it('rejects 400 INVALID_LOT_IDS for lotIds belonging to a different job', async () => {
    const { jobId } = await seedFixture();
    // A second job + lot in another customer
    const [otherC] = await testDb.insert(customer).values({ name: 'Other', sellerCode: 'OTH' }).returning();
    const [otherJ] = await testDb.insert(job).values({ customerId: otherC.id, jobNumber: 'X' }).returning();
    const [otherL] = await testDb.insert(lot).values({
      jobId: otherJ.id,
      lotNumber: 1,
      state: 'assigned' as const,
      source: 'imported' as const,
      intakeOperatorId: ADMIN,
    }).returning();

    const res = await callBatch(jobId, {
      batchNum: 1,
      lotIds: [otherL.id],
      exportLabel: 'L',
      totalBatches: 1,
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_LOT_IDS');
  });

  it('rejects 500 EXPORT_FAILED when a lot has a non-JPEG photo', async () => {
    const { jobId, lotIds } = await seedFixture({
      lotsWithPhotos: [{ lotNumber: 1, photoFilenames: ['weird.png'] }],
    });
    const res = await callBatch(jobId, {
      batchNum: 1,
      lotIds,
      exportLabel: 'L',
      totalBatches: 1,
    });
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('EXPORT_FAILED');
    expect(res.body.error.message).toContain('1');
  });

  it('skips photos with status != uploaded', async () => {
    const { jobId, lotIds } = await seedFixture({
      lotsWithPhotos: [{ lotNumber: 1, photoFilenames: ['p1.jpg'] }],
      includePendingPhotos: true,
    });
    const res = await callBatch(jobId, {
      batchNum: 1,
      lotIds,
      exportLabel: 'L',
      totalBatches: 1,
    });
    expect(res.status).toBe(200);
    expect(res.body.photoCount).toBe(1); // only the uploaded one
  });

  it('warehouse forbidden', async () => {
    const { jobId, lotIds } = await seedFixture();
    const res = await callBatch(jobId, {
      batchNum: 1,
      lotIds,
      exportLabel: 'L',
      totalBatches: 1,
    }, 'warehouse', WAREHOUSE);
    expect(res.status).toBe(403);
  });

  it('office allowed', async () => {
    const { jobId, lotIds } = await seedFixture();
    const res = await callBatch(jobId, {
      batchNum: 1,
      lotIds,
      exportLabel: 'L',
      totalBatches: 1,
    }, 'office', OFFICE);
    expect(res.status).toBe(200);
  });

  it('rejects malformed body (missing fields)', async () => {
    const { jobId } = await seedFixture();
    const res = await callBatch(jobId, { batchNum: 1 });
    expect(res.status).toBe(400);
  });

  it('rejects wrong method', async () => {
    const { jobId } = await seedFixture();
    const token = await mintTestJwt({ userId: ADMIN, role: 'admin' });
    const res = await callHandler(batchHandler, {
      method: 'GET',
      url: `/api/jobs/${jobId}/export-af360/batch?id=${jobId}`,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: undefined,
    });
    expect(res.status).toBe(405);
  });

  it('uploads with the expected filename pattern (batch N of M)', async () => {
    const { jobId, lotIds } = await seedFixture();
    const res = await callBatch(jobId, {
      batchNum: 3,
      lotIds,
      exportLabel: 'JobExport-acme-001-2026-05-04',
      totalBatches: 10,
    });
    expect(res.status).toBe(200);
    expect(res.body.filename).toBe('JobExport-acme-001-2026-05-04-batch-3-of-10.zip');
    expect(res.body.batchNum).toBe(3);
    expect(res.body.totalBatches).toBe(10);
  });
});
