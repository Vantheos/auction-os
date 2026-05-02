// tests/api/photos-status.test.ts
// PATCH /api/lots/[id]/photos/[photoId] — flip status from pending to
// uploaded or failed. Forward transitions only; idempotent if already
// in the target state.

import { describe, it, expect, beforeEach } from 'vitest';
import { testDb, truncateAll } from '../helpers/test-db';
import { mintTestJwt } from '../helpers/test-jwt';
import { callHandler } from '../helpers/call-handler';
import { appUser, customer, job, lot, lotPhoto } from '../../db/schema';
import handler from '../../api/lots/[id]/photos/[photoId]';
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
    jobId: j.id, lotNumber: 10, state: 'assigned', source: 'imported', intakeOperatorId: ADMIN,
  }).returning();
  const [p] = await testDb.insert(lotPhoto).values({
    lotId: l.id, storagePath: `lots/${l.id}/a.jpg`, displayOrder: 1, status: 'pending', capturedBy: ADMIN,
  }).returning();
  return { lotId: l.id, photoId: p.id };
}

async function patch(lotId: string, photoId: string, body: unknown, role: 'admin' | 'office' | 'warehouse', userId: string) {
  const token = await mintTestJwt({ userId, role });
  return callHandler<any>(handler, {
    method: 'PATCH',
    url: `/api/lots/${lotId}/photos/${photoId}?id=${lotId}&photoId=${photoId}`,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body,
  });
}

describe('PATCH /api/lots/[id]/photos/[photoId] status flip', () => {
  beforeEach(async () => { await truncateAll(); });

  it('flips pending → uploaded', async () => {
    const { lotId, photoId } = await seed();
    const res = await patch(lotId, photoId, { status: 'uploaded' }, 'warehouse', WAREHOUSE);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('uploaded');
    const [row] = await testDb.select().from(lotPhoto).where(eq(lotPhoto.id, photoId));
    expect(row.status).toBe('uploaded');
  });

  it('flips pending → failed', async () => {
    const { lotId, photoId } = await seed();
    const res = await patch(lotId, photoId, { status: 'failed' }, 'admin', ADMIN);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('failed');
  });

  it('is idempotent — flipping uploaded → uploaded returns 200', async () => {
    const { lotId, photoId } = await seed();
    await patch(lotId, photoId, { status: 'uploaded' }, 'admin', ADMIN);
    const res = await patch(lotId, photoId, { status: 'uploaded' }, 'admin', ADMIN);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('uploaded');
  });

  it('rejects uploaded → pending (illegal transition)', async () => {
    const { lotId, photoId } = await seed();
    await patch(lotId, photoId, { status: 'uploaded' }, 'admin', ADMIN);
    const res = await patch(lotId, photoId, { status: 'failed' }, 'admin', ADMIN);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('STATUS_TRANSITION_INVALID');
  });

  it('rejects mismatched lotId/photoId', async () => {
    const { photoId } = await seed();
    const wrongLot = '00000000-0000-0000-0000-000000000abc';
    const res = await patch(wrongLot, photoId, { status: 'uploaded' }, 'admin', ADMIN);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('LOT_PHOTO_MISMATCH');
  });

  it('rejects invalid status value', async () => {
    const { lotId, photoId } = await seed();
    const res = await patch(lotId, photoId, { status: 'pending' }, 'admin', ADMIN);
    expect(res.status).toBe(400);
  });

  it('requires auth', async () => {
    const { lotId, photoId } = await seed();
    const res = await callHandler(handler, {
      method: 'PATCH',
      url: `/api/lots/${lotId}/photos/${photoId}?id=${lotId}&photoId=${photoId}`,
      headers: { 'Content-Type': 'application/json' },
      body: { status: 'uploaded' },
    });
    expect(res.status).toBe(401);
  });
});
