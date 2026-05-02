// tests/api/photos-delete.test.ts
// DELETE /api/lots/[id]/photos/[photoId] — removes the row + storage object.
// If the deleted photo was not the last in display_order, subsequent rows
// re-shuffle down by 1 so the slot-1 photo (cover) is always the photo with
// the smallest display_order.

import { describe, it, expect, beforeEach } from 'vitest';
import { testDb, truncateAll } from '../helpers/test-db';
import { mintTestJwt } from '../helpers/test-jwt';
import { callHandler } from '../helpers/call-handler';
import { appUser, customer, job, lot, lotPhoto } from '../../db/schema';
import handler from '../../api/lots/[id]/photos/[photoId]';
import { asc, eq } from 'drizzle-orm';

const ADMIN = '00000000-0000-0000-0000-000000000001';

async function seed3() {
  await testDb.insert(appUser).values({ id: ADMIN, role: 'admin', displayName: 'A' });
  const [c] = await testDb.insert(customer).values({ name: 'X' }).returning();
  const [j] = await testDb.insert(job).values({ customerId: c.id, jobNumber: 'X-001' }).returning();
  const [l] = await testDb.insert(lot).values({
    jobId: j.id, lotNumber: 10, state: 'assigned', source: 'imported', intakeOperatorId: ADMIN,
  }).returning();
  const photos = await testDb.insert(lotPhoto).values([
    { lotId: l.id, storagePath: `lots/${l.id}/p1.jpg`, displayOrder: 1, status: 'uploaded', capturedBy: ADMIN },
    { lotId: l.id, storagePath: `lots/${l.id}/p2.jpg`, displayOrder: 2, status: 'uploaded', capturedBy: ADMIN },
    { lotId: l.id, storagePath: `lots/${l.id}/p3.jpg`, displayOrder: 3, status: 'uploaded', capturedBy: ADMIN },
  ]).returning();
  return { lotId: l.id, photos };
}

async function del(lotId: string, photoId: string, role: 'admin' | 'office' | 'warehouse', userId: string) {
  const token = await mintTestJwt({ userId, role });
  return callHandler<any>(handler, {
    method: 'DELETE',
    url: `/api/lots/${lotId}/photos/${photoId}?id=${lotId}&photoId=${photoId}`,
    headers: { Authorization: `Bearer ${token}` },
  });
}

describe('DELETE /api/lots/[id]/photos/[photoId]', () => {
  beforeEach(async () => { await truncateAll(); });

  it('deletes the row and removes it from the lot', async () => {
    const { lotId, photos } = await seed3();
    const res = await del(lotId, photos[1].id, 'admin', ADMIN);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    const remaining = await testDb.select().from(lotPhoto).where(eq(lotPhoto.lotId, lotId));
    expect(remaining).toHaveLength(2);
  });

  it('re-shuffles display_order so the cover follows whoever is in slot 1', async () => {
    const { lotId, photos } = await seed3();
    // Delete the cover (display_order = 1)
    await del(lotId, photos[0].id, 'admin', ADMIN);
    const remaining = await testDb.select().from(lotPhoto)
      .where(eq(lotPhoto.lotId, lotId)).orderBy(asc(lotPhoto.displayOrder));
    expect(remaining).toHaveLength(2);
    expect(remaining[0].id).toBe(photos[1].id);  // was slot 2 → now slot 1 (cover)
    expect(remaining[0].displayOrder).toBe(1);
    expect(remaining[1].id).toBe(photos[2].id);  // was slot 3 → now slot 2
    expect(remaining[1].displayOrder).toBe(2);
  });

  it('returns the new ordered list in the response', async () => {
    const { lotId, photos } = await seed3();
    const res = await del(lotId, photos[1].id, 'admin', ADMIN);
    expect(res.body.remaining).toHaveLength(2);
    expect(res.body.remaining[0].displayOrder).toBe(1);
    expect(res.body.remaining[1].displayOrder).toBe(2);
  });

  it('rejects mismatched lotId/photoId', async () => {
    const { photos } = await seed3();
    const wrongLot = '00000000-0000-0000-0000-000000000abc';
    const res = await del(wrongLot, photos[0].id, 'admin', ADMIN);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('LOT_PHOTO_MISMATCH');
  });

  it('returns 404 when photo does not exist', async () => {
    const { lotId } = await seed3();
    const fakeId = '00000000-0000-0000-0000-000000000fff';
    const res = await del(lotId, fakeId, 'admin', ADMIN);
    expect(res.status).toBe(404);
  });

  it('requires auth', async () => {
    const { lotId, photos } = await seed3();
    const res = await callHandler(handler, {
      method: 'DELETE',
      url: `/api/lots/${lotId}/photos/${photos[0].id}?id=${lotId}&photoId=${photos[0].id}`,
    });
    expect(res.status).toBe(401);
  });
});
