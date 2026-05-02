import { describe, it, expect, beforeEach } from 'vitest';
import { testDb, truncateAll } from '../helpers/test-db.js';
import { mintTestJwt } from '../helpers/test-jwt.js';
import { callHandler } from '../helpers/call-handler.js';
import { appUser, customer, job, lot, lotPhoto } from '../../db/schema.js';
import handler from '../../api/lots/[id]/photos.js';

const ADMIN = '00000000-0000-0000-0000-000000000001';

async function seed() {
  await testDb.insert(appUser).values({ id: ADMIN, role: 'admin', displayName: 'A' });
  const [c] = await testDb.insert(customer).values({ name: 'X' }).returning();
  const [j] = await testDb.insert(job).values({ customerId: c.id, jobNumber: 'X' }).returning();
  const [l] = await testDb.insert(lot).values({ jobId: j.id, lotNumber: 10, state: 'assigned', source: 'imported', intakeOperatorId: ADMIN }).returning();
  await testDb.insert(lotPhoto).values([
    { lotId: l.id, storagePath: 'a/1.jpg', displayOrder: 1, status: 'uploaded', capturedBy: ADMIN },
    { lotId: l.id, storagePath: 'a/2.jpg', displayOrder: 2, status: 'pending', capturedBy: ADMIN },
  ]);
  return l.id;
}

async function call(lotId: string) {
  const token = await mintTestJwt({ userId: ADMIN, role: 'admin' });
  return callHandler<{ photos: unknown[] }>(handler, {
    method: 'GET', url: `/api/lots/${lotId}/photos?id=${lotId}`,
    headers: { Authorization: `Bearer ${token}` },
  });
}

describe('GET /api/lots/[id]/photos', () => {
  beforeEach(async () => { await truncateAll(); });
  it('returns photos in display_order', async () => {
    const lotId = await seed();
    const res = await call(lotId);
    expect(res.status).toBe(200);
    expect(res.body.photos).toHaveLength(2);
    expect((res.body.photos[0] as any).displayOrder).toBe(1);
  });
  it('requires auth', async () => {
    const lotId = await seed();
    const res = await callHandler(handler, { method: 'GET', url: `/api/lots/${lotId}/photos?id=${lotId}` });
    expect(res.status).toBe(401);
  });
  // POST/PATCH/DELETE removed — capture endpoints landed in Phase 3.
  // Comprehensive coverage of POST + signedUrl augmentation lives in
  // tests/api/photos-create.test.ts (Phase B test suite).
});
