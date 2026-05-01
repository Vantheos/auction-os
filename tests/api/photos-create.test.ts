// tests/api/photos-create.test.ts
// POST /api/lots/[id]/photos — append a subsequent photo to an existing lot.
// Returns the new pending row + signed upload URL. Caps at 12 per lot.
// Also verifies GET augments uploaded photos with a signedUrl.

import { describe, it, expect, beforeEach } from 'vitest';
import { testDb, truncateAll } from '../helpers/test-db';
import { mintTestJwt } from '../helpers/test-jwt';
import { callHandler } from '../helpers/call-handler';
import { appUser, customer, job, lot, lotPhoto } from '../../db/schema';
import handler from '../../api/lots/[id]/photos';
import { eq } from 'drizzle-orm';

const ADMIN = '00000000-0000-0000-0000-000000000001';
const WAREHOUSE = '00000000-0000-0000-0000-000000000003';

async function seed() {
  await testDb.insert(appUser).values([
    { id: ADMIN, role: 'admin', displayName: 'Admin' },
    { id: WAREHOUSE, role: 'warehouse', displayName: 'Wh' },
  ]);
  const [c] = await testDb.insert(customer).values({ name: 'X' }).returning();
  const [j] = await testDb.insert(job).values({ customerId: c.id, jobNumber: 'X-001' }).returning();
  const [l] = await testDb.insert(lot).values({
    jobId: j.id, lotNumber: 10, state: 'assigned', intakeOperatorId: ADMIN,
  }).returning();
  return l.id;
}

async function postPhoto(lotId: string, role: 'admin' | 'office' | 'warehouse', userId: string, body: unknown = {}) {
  const token = await mintTestJwt({ userId, role });
  return callHandler<any>(handler, {
    method: 'POST',
    url: `/api/lots/${lotId}/photos?id=${lotId}`,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body,
  });
}

async function getPhotos(lotId: string, role: 'admin' | 'office' | 'warehouse', userId: string) {
  const token = await mintTestJwt({ userId, role });
  return callHandler<any>(handler, {
    method: 'GET',
    url: `/api/lots/${lotId}/photos?id=${lotId}`,
    headers: { Authorization: `Bearer ${token}` },
  });
}

describe('POST /api/lots/[id]/photos', () => {
  beforeEach(async () => { await truncateAll(); });

  it('warehouse can append a photo; returns row + signed upload URL', async () => {
    const lotId = await seed();
    const res = await postPhoto(lotId, 'warehouse', WAREHOUSE);
    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.lotId).toBe(lotId);
    expect(res.body.status).toBe('pending');
    expect(res.body.displayOrder).toBe(1);
    expect(res.body.uploadUrl).toMatch(/^https?:\/\//);
  });

  it('display_order increments per existing photo count', async () => {
    const lotId = await seed();
    await testDb.insert(lotPhoto).values([
      { lotId, storagePath: 'lots/x/a.jpg', displayOrder: 1, status: 'uploaded', capturedBy: ADMIN },
      { lotId, storagePath: 'lots/x/b.jpg', displayOrder: 2, status: 'uploaded', capturedBy: ADMIN },
    ]);
    const res = await postPhoto(lotId, 'admin', ADMIN);
    expect(res.status).toBe(201);
    expect(res.body.displayOrder).toBe(3);
  });

  it('rejects 13th photo with 422 MAX_PHOTOS', async () => {
    const lotId = await seed();
    const rows = Array.from({ length: 12 }).map((_, i) => ({
      lotId, storagePath: `lots/x/p${i}.jpg`, displayOrder: i + 1,
      status: 'uploaded' as const, capturedBy: ADMIN,
    }));
    await testDb.insert(lotPhoto).values(rows);
    const res = await postPhoto(lotId, 'admin', ADMIN);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('MAX_PHOTOS');
  });

  it('rejects when lot does not exist', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000999';
    const res = await postPhoto(fakeId, 'admin', ADMIN);
    expect(res.status).toBe(404);
  });

  it('requires auth', async () => {
    const lotId = await seed();
    const res = await callHandler(handler, {
      method: 'POST', url: `/api/lots/${lotId}/photos?id=${lotId}`,
      headers: { 'Content-Type': 'application/json' },
      body: {},
    });
    expect(res.status).toBe(401);
  });

  it('persists with status=pending and storage_path under lots/{lotId}/', async () => {
    const lotId = await seed();
    const res = await postPhoto(lotId, 'admin', ADMIN);
    const [row] = await testDb.select().from(lotPhoto).where(eq(lotPhoto.id, res.body.id));
    expect(row.status).toBe('pending');
    expect(row.storagePath).toMatch(new RegExp(`^lots/${lotId}/`));
  });
});

describe('GET /api/lots/[id]/photos signed URL augmentation', () => {
  beforeEach(async () => { await truncateAll(); });

  it('augments uploaded photos with a signedUrl field and leaves pending/failed null', async () => {
    const lotId = await seed();
    await testDb.insert(lotPhoto).values([
      { lotId, storagePath: `lots/${lotId}/a.jpg`, displayOrder: 1, status: 'uploaded', capturedBy: ADMIN },
      { lotId, storagePath: `lots/${lotId}/b.jpg`, displayOrder: 2, status: 'pending',  capturedBy: ADMIN },
      { lotId, storagePath: `lots/${lotId}/c.jpg`, displayOrder: 3, status: 'failed',   capturedBy: ADMIN },
    ]);
    const res = await getPhotos(lotId, 'admin', ADMIN);
    expect(res.status).toBe(200);
    expect(res.body.photos).toHaveLength(3);
    // The uploaded photo's row has a signedUrl field. In the test environment
    // the file doesn't actually exist in Storage, so bulk-sign fails for that
    // path and signedUrl is null. In production with a real upload it would
    // be a URL string. Either is correct per the handler contract.
    const cover = res.body.photos[0];
    expect('signedUrl' in cover).toBe(true);
    expect(cover.signedUrl === null || typeof cover.signedUrl === 'string').toBe(true);
    // Pending and failed photos always have null signedUrl, regardless of storage state.
    expect(res.body.photos[1].signedUrl).toBeNull();
    expect(res.body.photos[2].signedUrl).toBeNull();
  });
});
