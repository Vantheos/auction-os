// tests/api/lots-fill-gaps.test.ts
// Lot-number allocation now fills the lowest gap before extending past
// MAX. Operators flagged that AF360 export to the auction platform
// requires sequential lot numbers, so a delete or unassign in the middle
// of a job leaves a hole that should be backfilled by the next add /
// move into the job.
//
// Covers all three sites that allocate lot numbers:
//   - POST /api/lots          (catalog session creates a new lot)
//   - POST /api/lots/[id]/move (single-lot move)
//   - POST /api/lots/bulk     (bulk move action)
import { describe, it, expect, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { testDb, truncateAll } from '../helpers/test-db';
import { mintTestJwt } from '../helpers/test-jwt';
import { callHandler, type CallResult } from '../helpers/call-handler';
import { appUser, customer, job, lot } from '../../db/schema';
import lotsHandler from '../../api/lots/index';
import moveHandler from '../../api/lots/[id]/move';
import bulkHandler from '../../api/lots/bulk';

const ADMIN = '00000000-0000-0000-0000-000000000001';

async function seed() {
  await testDb.insert(appUser).values({ id: ADMIN, role: 'admin', displayName: 'A' });
  const [c] = await testDb.insert(customer).values({ name: 'Smith' }).returning();
  const [j1] = await testDb.insert(job).values({ customerId: c.id, jobNumber: 'A-001' }).returning();
  const [j2] = await testDb.insert(job).values({ customerId: c.id, jobNumber: 'A-002' }).returning();
  return { jobId: j1.id, otherJobId: j2.id };
}

async function insertLot(jobId: string, lotNumber: number) {
  await testDb.insert(lot).values({
    jobId, lotNumber, state: 'assigned', source: 'imported', intakeOperatorId: ADMIN, quantity: 1,
  });
}

async function callPostLots(jobId: string): Promise<CallResult<{ lotNumber: number }>> {
  const token = await mintTestJwt({ userId: ADMIN, role: 'admin' });
  return callHandler(lotsHandler, {
    method: 'POST', url: '/api/lots',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: { jobId, firstPhoto: { displayOrder: 1 } },
  });
}

async function callMove(id: string, destinationJobId: string): Promise<CallResult<{ lotNumber: number }>> {
  const token = await mintTestJwt({ userId: ADMIN, role: 'admin' });
  return callHandler(moveHandler, {
    method: 'POST', url: `/api/lots/${id}/move?id=${id}`,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: { destinationJobId },
  });
}

async function callBulkMove(lotIds: string[], destinationJobId: string): Promise<CallResult<{ results: { id: string; ok: boolean }[] }>> {
  const token = await mintTestJwt({ userId: ADMIN, role: 'admin' });
  return callHandler(bulkHandler, {
    method: 'POST', url: '/api/lots/bulk',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: { action: 'move', lotIds, params: { destinationJobId } },
  });
}

beforeEach(async () => { await truncateAll(); });

describe('Lot-number allocation — fill-gaps behavior', () => {
  describe('POST /api/lots', () => {
    it('first lot in an empty job → baseline 10', async () => {
      const { jobId } = await seed();
      const res = await callPostLots(jobId);
      expect(res.status).toBe(201);
      expect(res.body.lotNumber).toBe(10);
    });

    it('contiguous job [10, 11] → 12 (extends past max)', async () => {
      const { jobId } = await seed();
      await insertLot(jobId, 10);
      await insertLot(jobId, 11);
      const res = await callPostLots(jobId);
      expect(res.status).toBe(201);
      expect(res.body.lotNumber).toBe(12);
    });

    it('single gap [10, 12] → fills 11', async () => {
      const { jobId } = await seed();
      await insertLot(jobId, 10);
      await insertLot(jobId, 12);
      const res = await callPostLots(jobId);
      expect(res.status).toBe(201);
      expect(res.body.lotNumber).toBe(11);
    });

    it('multiple gaps [10, 12, 15] → fills the lowest (11)', async () => {
      const { jobId } = await seed();
      await insertLot(jobId, 10);
      await insertLot(jobId, 12);
      await insertLot(jobId, 15);
      const res = await callPostLots(jobId);
      expect(res.status).toBe(201);
      expect(res.body.lotNumber).toBe(11);
    });

    it('two consecutive adds with multiple gaps fill in order', async () => {
      const { jobId } = await seed();
      await insertLot(jobId, 10);
      await insertLot(jobId, 12);
      await insertLot(jobId, 15);
      const a = await callPostLots(jobId);
      const b = await callPostLots(jobId);
      expect(a.body.lotNumber).toBe(11);
      expect(b.body.lotNumber).toBe(13); // next-lowest gap after 11 fills
    });

    it('high-only seed [50] → next allocation fills 10 (lowest gap from baseline)', async () => {
      const { jobId } = await seed();
      await insertLot(jobId, 50);
      const res = await callPostLots(jobId);
      expect(res.status).toBe(201);
      expect(res.body.lotNumber).toBe(10);
    });
  });

  describe('POST /api/lots/[id]/move', () => {
    it('moves into a job with a gap → fills the gap', async () => {
      const { jobId, otherJobId } = await seed();
      await insertLot(jobId, 10);
      await insertLot(jobId, 12);
      // Source lot in the other job
      const [src] = await testDb.insert(lot).values({
        jobId: otherJobId, lotNumber: 10, state: 'assigned', source: 'imported', intakeOperatorId: ADMIN, quantity: 1,
      }).returning();
      const res = await callMove(src.id, jobId);
      expect(res.status).toBe(200);
      expect(res.body.lotNumber).toBe(11);
    });

    it('moves into a contiguous job → extends past max', async () => {
      const { jobId, otherJobId } = await seed();
      await insertLot(jobId, 10);
      await insertLot(jobId, 11);
      const [src] = await testDb.insert(lot).values({
        jobId: otherJobId, lotNumber: 10, state: 'assigned', source: 'imported', intakeOperatorId: ADMIN, quantity: 1,
      }).returning();
      const res = await callMove(src.id, jobId);
      expect(res.body.lotNumber).toBe(12);
    });
  });

  describe('POST /api/lots/bulk (move action)', () => {
    it('bulk-move multiple lots fills gaps lowest-first across iterations', async () => {
      const { jobId, otherJobId } = await seed();
      // Destination has gaps at 11 and 14
      await insertLot(jobId, 10);
      await insertLot(jobId, 12);
      await insertLot(jobId, 13);
      await insertLot(jobId, 15);
      // Three source lots to bulk-move
      const sources = await testDb.insert(lot).values([
        { jobId: otherJobId, lotNumber: 10, state: 'assigned', source: 'imported', intakeOperatorId: ADMIN, quantity: 1 },
        { jobId: otherJobId, lotNumber: 11, state: 'assigned', source: 'imported', intakeOperatorId: ADMIN, quantity: 1 },
        { jobId: otherJobId, lotNumber: 12, state: 'assigned', source: 'imported', intakeOperatorId: ADMIN, quantity: 1 },
      ]).returning();

      const res = await callBulkMove(sources.map((s) => s.id), jobId);
      expect(res.status).toBe(200);
      expect(res.body.results.every((r) => r.ok)).toBe(true);

      // Read back what numbers each got assigned. Order of moves is the
      // input order, but post-iteration each next allocation picks the
      // lowest remaining gap.
      const moved = await Promise.all(sources.map(async (s) => {
        const [row] = await testDb.select({ lotNumber: lot.lotNumber }).from(lot).where(eq(lot.id, s.id));
        return row?.lotNumber;
      }));
      // First fills 11 (lowest gap), second fills 14, third extends past
      // max (now 15) → 16.
      expect(moved).toEqual([11, 14, 16]);
    });
  });
});
