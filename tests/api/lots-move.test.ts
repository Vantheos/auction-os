// tests/api/lots-move.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { testDb, truncateAll } from '../helpers/test-db';
import { mintTestJwt } from '../helpers/test-jwt';
import { callHandler, type CallResult } from '../helpers/call-handler';
import { appUser, customer, job, lot } from '../../db/schema';
import handler from '../../api/lots/[id]/move';

const ADMIN = '00000000-0000-0000-0000-000000000001';
const OFFICE = '00000000-0000-0000-0000-000000000002';
const WAREHOUSE = '00000000-0000-0000-0000-000000000003';

async function seed() {
  await testDb.insert(appUser).values([
    { id: ADMIN, role: 'admin', displayName: 'A' },
    { id: OFFICE, role: 'office', displayName: 'O' },
    { id: WAREHOUSE, role: 'warehouse', displayName: 'W' },
  ]);
  const [c1] = await testDb.insert(customer).values({ name: 'Smith' }).returning();
  const [c2] = await testDb.insert(customer).values({ name: 'Jones' }).returning();
  const [j1] = await testDb.insert(job).values({ customerId: c1.id, jobNumber: 'A-001' }).returning();
  const [j2] = await testDb.insert(job).values({ customerId: c2.id, jobNumber: 'B-001' }).returning();
  const [l] = await testDb.insert(lot).values({
    jobId: j1.id, lotNumber: 10, state: 'assigned', intakeOperatorId: ADMIN,
  }).returning();
  return { lotId: l.id, srcJobId: j1.id, dstJobId: j2.id };
}

async function call(id: string, body: unknown, role: 'admin' | 'office' | 'warehouse', userId: string): Promise<CallResult<any>> {
  const token = await mintTestJwt({ userId, role });
  return callHandler(handler, {
    method: 'POST', url: `/api/lots/${id}/move?id=${id}`,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body,
  });
}

describe('POST /api/lots/[id]/move', () => {
  beforeEach(async () => { await truncateAll(); });

  it('admin moves lot to a different job, allocating new lot_number', async () => {
    const { lotId, dstJobId } = await seed();
    const res = await call(lotId, { destinationJobId: dstJobId }, 'admin', ADMIN);
    expect(res.status).toBe(200);
    expect(res.body.jobId).toBe(dstJobId);
    expect(res.body.lotNumber).toBe(10);  // first lot in destination, baseline 10
  });

  it('office can move', async () => {
    const { lotId, dstJobId } = await seed();
    const res = await call(lotId, { destinationJobId: dstJobId }, 'office', OFFICE);
    expect(res.status).toBe(200);
  });

  it('warehouse cannot move (403)', async () => {
    const { lotId, dstJobId } = await seed();
    const res = await call(lotId, { destinationJobId: dstJobId }, 'warehouse', WAREHOUSE);
    expect(res.status).toBe(403);
  });

  it('rejects move when lot is sold (only assigned can be moved per spec §4.2)', async () => {
    const { lotId, dstJobId } = await seed();
    await testDb.update(lot).set({ state: 'sold' }).where(eq(lot.id, lotId));
    const res = await call(lotId, { destinationJobId: dstJobId }, 'admin', ADMIN);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('ILLEGAL_MOVE');
  });

  it('404 on unknown lot id', async () => {
    const { dstJobId } = await seed();
    const res = await call('00000000-0000-0000-0000-000000000099', { destinationJobId: dstJobId }, 'admin', ADMIN);
    expect(res.status).toBe(404);
  });

  it('rejects missing destinationJobId', async () => {
    const { lotId } = await seed();
    const res = await call(lotId, {}, 'admin', ADMIN);
    expect(res.status).toBe(400);
  });

  it('allocates lot_numbers sequentially in destination job', async () => {
    const { srcJobId, dstJobId } = await seed();
    // Pre-seed dst job with an existing lot at number 10 + assign extras
    await testDb.insert(lot).values([
      { jobId: dstJobId, lotNumber: 10, state: 'assigned', intakeOperatorId: ADMIN },
      { jobId: dstJobId, lotNumber: 11, state: 'assigned', intakeOperatorId: ADMIN },
    ]);
    // Add another lot to the source job and move it
    const [src2] = await testDb.insert(lot).values({
      jobId: srcJobId, lotNumber: 11, state: 'assigned', intakeOperatorId: ADMIN,
    }).returning();
    const res = await call(src2.id, { destinationJobId: dstJobId }, 'admin', ADMIN);
    expect(res.status).toBe(200);
    expect(res.body.jobId).toBe(dstJobId);
    expect(res.body.lotNumber).toBe(12);  // 10, 11 already there → next is 12
  });
});
