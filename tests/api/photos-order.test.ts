// tests/api/photos-order.test.ts
// PATCH /api/lots/[id]/photos/order — rewrite display_order for all photos
// of a lot. Body must contain exactly the photo ids that belong to the lot
// (no missing, no extras).

import { describe, it, expect, beforeEach } from 'vitest';
import { testDb, truncateAll } from '../helpers/test-db';
import { mintTestJwt } from '../helpers/test-jwt';
import { callHandler } from '../helpers/call-handler';
import { appUser, customer, job, lot, lotPhoto } from '../../db/schema';
import handler from '../../api/lots/[id]/photos/order';
import { asc, eq } from 'drizzle-orm';

const ADMIN = '00000000-0000-0000-0000-000000000001';
const WAREHOUSE = '00000000-0000-0000-0000-000000000003';

async function seed() {
  await testDb.insert(appUser).values([
    { id: ADMIN, role: 'admin', displayName: 'A' },
    { id: WAREHOUSE, role: 'warehouse', displayName: 'W' },
  ]);
  const [c] = await testDb.insert(customer).values({ name: 'X' }).returning();
  const [j] = await testDb.insert(job).values({ customerId: c.id, jobNumber: 'X-001' }).returning();
  const [l] = await testDb.insert(lot).values({
    jobId: j.id, lotNumber: 10, state: 'assigned', intakeOperatorId: ADMIN,
  }).returning();
  const photos = await testDb.insert(lotPhoto).values([
    { lotId: l.id, storagePath: `lots/${l.id}/a.jpg`, displayOrder: 1, status: 'uploaded', capturedBy: ADMIN },
    { lotId: l.id, storagePath: `lots/${l.id}/b.jpg`, displayOrder: 2, status: 'uploaded', capturedBy: ADMIN },
    { lotId: l.id, storagePath: `lots/${l.id}/c.jpg`, displayOrder: 3, status: 'uploaded', capturedBy: ADMIN },
  ]).returning();
  return { lotId: l.id, photoIds: photos.map((p) => p.id) };
}

async function reorder(lotId: string, order: string[], role: 'admin' | 'office' | 'warehouse', userId: string) {
  const token = await mintTestJwt({ userId, role });
  return callHandler<any>(handler, {
    method: 'PATCH',
    url: `/api/lots/${lotId}/photos/order?id=${lotId}`,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: { order },
  });
}

describe('PATCH /api/lots/[id]/photos/order', () => {
  beforeEach(async () => { await truncateAll(); });

  it('warehouse can reorder; new order persisted', async () => {
    const { lotId, photoIds } = await seed();
    const reversed = [...photoIds].reverse();
    const res = await reorder(lotId, reversed, 'warehouse', WAREHOUSE);
    expect(res.status).toBe(200);
    const rows = await testDb.select().from(lotPhoto)
      .where(eq(lotPhoto.lotId, lotId)).orderBy(asc(lotPhoto.displayOrder));
    expect(rows[0].id).toBe(reversed[0]);
    expect(rows[0].displayOrder).toBe(1);
    expect(rows[2].id).toBe(reversed[2]);
    expect(rows[2].displayOrder).toBe(3);
  });

  it('rejects with 422 ORDER_MISMATCH when order has missing ids', async () => {
    const { lotId, photoIds } = await seed();
    const partial = photoIds.slice(0, 2);
    const res = await reorder(lotId, partial, 'admin', ADMIN);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('ORDER_MISMATCH');
  });

  it('rejects with 422 ORDER_MISMATCH when order has extra ids', async () => {
    const { lotId, photoIds } = await seed();
    const extra = [...photoIds, '00000000-0000-0000-0000-000000000abc'];
    const res = await reorder(lotId, extra, 'admin', ADMIN);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('ORDER_MISMATCH');
  });

  it('rejects with 422 ORDER_MISMATCH when order references unrelated photo ids', async () => {
    const { lotId } = await seed();
    const fakeIds = [
      '00000000-0000-0000-0000-000000000aaa',
      '00000000-0000-0000-0000-000000000bbb',
      '00000000-0000-0000-0000-000000000ccc',
    ];
    const res = await reorder(lotId, fakeIds, 'admin', ADMIN);
    expect(res.status).toBe(422);
  });

  it('returns the new ordered list', async () => {
    const { lotId, photoIds } = await seed();
    const reversed = [...photoIds].reverse();
    const res = await reorder(lotId, reversed, 'admin', ADMIN);
    expect(res.body.photos).toHaveLength(3);
    expect(res.body.photos.map((p: { id: string }) => p.id)).toEqual(reversed);
  });

  it('requires auth', async () => {
    const { lotId, photoIds } = await seed();
    const res = await callHandler(handler, {
      method: 'PATCH',
      url: `/api/lots/${lotId}/photos/order?id=${lotId}`,
      headers: { 'Content-Type': 'application/json' },
      body: { order: photoIds },
    });
    expect(res.status).toBe(401);
  });
});
