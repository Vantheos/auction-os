// tests/api/jobs-id-compact-lots.test.ts
//
// POST /api/jobs/:id/compact-lots — fills lot-number gaps by moving the
// highest-numbered lots into the lowest gaps. Each moved lot's
// label_reprint_needed flag is set so the operator can find them via the
// Reprint pending filter and re-print before shipping to auction.
import { describe, it, expect, beforeEach } from 'vitest';
import { eq, asc } from 'drizzle-orm';
import { testDb, truncateAll } from '../helpers/test-db';
import { mintTestJwt } from '../helpers/test-jwt';
import { callHandler, type CallResult } from '../helpers/call-handler';
import { appUser, customer, job, lot } from '../../db/schema';
import handler, { computeCompactMoves } from '../../api/jobs/[id]/compact-lots';

const ADMIN = '00000000-0000-0000-0000-000000000001';
const OFFICE = '00000000-0000-0000-0000-000000000002';
const WAREHOUSE = '00000000-0000-0000-0000-000000000003';

async function seed() {
  await testDb.insert(appUser).values([
    { id: ADMIN, role: 'admin', displayName: 'A' },
    { id: OFFICE, role: 'office', displayName: 'O' },
    { id: WAREHOUSE, role: 'warehouse', displayName: 'W' },
  ]);
  const [c] = await testDb.insert(customer).values({ name: 'Smith' }).returning();
  const [j] = await testDb.insert(job).values({ customerId: c.id, jobNumber: 'A-001' }).returning();
  return { jobId: j.id };
}

async function insertLot(jobId: string, lotNumber: number) {
  const [row] = await testDb.insert(lot).values({
    jobId, lotNumber, state: 'assigned', source: 'imported', intakeOperatorId: ADMIN, quantity: 1,
  }).returning();
  return row;
}

async function call(jobId: string, role: 'admin' | 'office' | 'warehouse', userId: string): Promise<CallResult<{ moves: { lotId: string; oldNumber: number; newNumber: number }[]; renumbered: number }>> {
  const token = await mintTestJwt({ userId, role });
  return callHandler(handler, {
    method: 'POST', url: `/api/jobs/${jobId}/compact-lots?id=${jobId}`,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  });
}

beforeEach(async () => { await truncateAll(); });

describe('computeCompactMoves (pure)', () => {
  it('returns no moves for an empty job', () => {
    expect(computeCompactMoves([])).toEqual([]);
  });

  it('returns no moves for a contiguous sequence', () => {
    const lots = [
      { id: 'a', lotNumber: 10 },
      { id: 'b', lotNumber: 11 },
      { id: 'c', lotNumber: 12 },
    ];
    expect(computeCompactMoves(lots)).toEqual([]);
  });

  it('moves the highest into the lowest gap (single gap)', () => {
    const lots = [
      { id: 'a', lotNumber: 10 },
      { id: 'b', lotNumber: 12 },
      { id: 'c', lotNumber: 13 },
    ];
    expect(computeCompactMoves(lots)).toEqual([
      { lotId: 'c', oldNumber: 13, newNumber: 11 },
    ]);
  });

  it('user example — gaps at 11, 25, 77 in a 100-lot job (highest 3 fill them)', () => {
    // Build a 100-lot sequence at 10..109 minus {11, 25, 77} = 97 lots.
    const lots: { id: string; lotNumber: number }[] = [];
    for (let n = 10; n <= 109; n++) {
      if (n === 11 || n === 25 || n === 77) continue;
      lots.push({ id: `lot-${n}`, lotNumber: n });
    }
    const moves = computeCompactMoves(lots);
    expect(moves).toEqual([
      { lotId: 'lot-109', oldNumber: 109, newNumber: 11 },
      { lotId: 'lot-108', oldNumber: 108, newNumber: 25 },
      { lotId: 'lot-107', oldNumber: 107, newNumber: 77 },
    ]);
  });

  it('iterates correctly when each move opens up a new tail-gap that closes itself', () => {
    // [10, 12, 15] — gaps in [10..15] = {11, 13, 14}. Move 15→11. New
    // sequence [10, 11, 12]; nothing else to do.
    const lots = [
      { id: 'a', lotNumber: 10 },
      { id: 'b', lotNumber: 12 },
      { id: 'c', lotNumber: 15 },
    ];
    expect(computeCompactMoves(lots)).toEqual([
      { lotId: 'c', oldNumber: 15, newNumber: 11 },
    ]);
  });
});

describe('POST /api/jobs/:id/compact-lots', () => {
  it('admin can compact, returns moves + renumbered count', async () => {
    // [10, 12, 15] → MAX=15, gaps={11, 13, 14}. Move 15→11. New
    // sequence [10, 11, 12]; further iterations find no gap below the
    // new MAX of 12. Single move, contiguous result.
    const { jobId } = await seed();
    await insertLot(jobId, 10);
    await insertLot(jobId, 12);
    const lot15 = await insertLot(jobId, 15);

    const res = await call(jobId, 'admin', ADMIN);
    expect(res.status).toBe(200);
    expect(res.body.renumbered).toBe(1);
    expect(res.body.moves).toEqual([
      { lotId: lot15.id, oldNumber: 15, newNumber: 11 },
    ]);
  });

  it('sets label_reprint_needed only on moved lots, not on unchanged lots', async () => {
    const { jobId } = await seed();
    const lot10 = await insertLot(jobId, 10);
    const lot12 = await insertLot(jobId, 12);
    const lot15 = await insertLot(jobId, 15);

    await call(jobId, 'admin', ADMIN);
    const rows = await testDb.select().from(lot).where(eq(lot.jobId, jobId));

    const lot10After = rows.find((r) => r.id === lot10.id)!;
    const lot12After = rows.find((r) => r.id === lot12.id)!;
    const lot15After = rows.find((r) => r.id === lot15.id)!;
    // Lot 10 stays at 10 — no reprint flag.
    expect(lot10After.lotNumber).toBe(10);
    expect(lot10After.labelReprintNeeded).toBe(false);
    // Lot 12 stays at 12 (per the algorithm — it's not the highest, so
    // it doesn't move; the single move 15→11 is enough to compact).
    expect(lot12After.lotNumber).toBe(12);
    expect(lot12After.labelReprintNeeded).toBe(false);
    // Lot 15 moved to 11 — reprint flag set.
    expect(lot15After.lotNumber).toBe(11);
    expect(lot15After.labelReprintNeeded).toBe(true);
  });

  it('sets label_reprint_needed on multi-move compacts', async () => {
    // 5 lots with 2 widely-spaced gaps: [10, 12, 14, 16, 20]. After
    // compact: {20→11, 16→13, 14→15-no-wait}. Let's trace:
    //   MAX=20, lowest gap=11. Move 20→11. State [10,11,12,14,16].
    //   MAX=16, lowest gap=13. Move 16→13. State [10,11,12,13,14].
    //   MAX=14, no gap. Done.
    // → 2 moves: lot at 20 → 11, lot at 16 → 13.
    const { jobId } = await seed();
    await insertLot(jobId, 10);
    await insertLot(jobId, 12);
    const lot14 = await insertLot(jobId, 14);
    const lot16 = await insertLot(jobId, 16);
    const lot20 = await insertLot(jobId, 20);

    const res = await call(jobId, 'admin', ADMIN);
    expect(res.body.renumbered).toBe(2);

    const rows = await testDb.select().from(lot).where(eq(lot.jobId, jobId));
    expect(rows.find((r) => r.id === lot20.id)?.lotNumber).toBe(11);
    expect(rows.find((r) => r.id === lot20.id)?.labelReprintNeeded).toBe(true);
    expect(rows.find((r) => r.id === lot16.id)?.lotNumber).toBe(13);
    expect(rows.find((r) => r.id === lot16.id)?.labelReprintNeeded).toBe(true);
    // Lot 14 didn't move.
    expect(rows.find((r) => r.id === lot14.id)?.lotNumber).toBe(14);
    expect(rows.find((r) => r.id === lot14.id)?.labelReprintNeeded).toBe(false);
  });

  it('produces a contiguous sequence after compact', async () => {
    const { jobId } = await seed();
    await insertLot(jobId, 10);
    await insertLot(jobId, 12);
    await insertLot(jobId, 15);
    await insertLot(jobId, 17);

    await call(jobId, 'admin', ADMIN);
    const rows = await testDb.select({ lotNumber: lot.lotNumber }).from(lot)
      .where(eq(lot.jobId, jobId)).orderBy(asc(lot.lotNumber));
    const numbers = rows.map((r) => r.lotNumber);
    expect(numbers).toEqual([10, 11, 12, 13]);
  });

  it('no-op (returns renumbered=0) for a contiguous job', async () => {
    const { jobId } = await seed();
    await insertLot(jobId, 10);
    await insertLot(jobId, 11);
    await insertLot(jobId, 12);

    const res = await call(jobId, 'admin', ADMIN);
    expect(res.status).toBe(200);
    expect(res.body.renumbered).toBe(0);
    expect(res.body.moves).toEqual([]);
  });

  it('no-op for an empty job', async () => {
    const { jobId } = await seed();
    const res = await call(jobId, 'admin', ADMIN);
    expect(res.status).toBe(200);
    expect(res.body.renumbered).toBe(0);
  });

  it('office can compact', async () => {
    const { jobId } = await seed();
    await insertLot(jobId, 10);
    await insertLot(jobId, 12);
    const res = await call(jobId, 'office', OFFICE);
    expect(res.status).toBe(200);
  });

  it('warehouse cannot compact (admin/office only)', async () => {
    const { jobId } = await seed();
    const res = await call(jobId, 'warehouse', WAREHOUSE);
    expect(res.status).toBe(403);
  });

  it('returns 404 for an unknown job', async () => {
    await seed();
    const fakeJobId = '00000000-0000-0000-0000-00000000FAKE'.replace('FAKE', '0000');
    const res = await call(fakeJobId, 'admin', ADMIN);
    expect(res.status).toBe(404);
  });

  it('rejects non-POST methods', async () => {
    const { jobId } = await seed();
    const token = await mintTestJwt({ userId: ADMIN, role: 'admin' });
    const res = await callHandler(handler, {
      method: 'GET', url: `/api/jobs/${jobId}/compact-lots?id=${jobId}`,
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(405);
  });
});
