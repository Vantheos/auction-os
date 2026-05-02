// tests/api/lots-bulk.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { testDb, truncateAll } from '../helpers/test-db';
import { mintTestJwt } from '../helpers/test-jwt';
import { callHandler, type CallResult } from '../helpers/call-handler';
import { appUser, customer, job, lot } from '../../db/schema';
import handler from '../../api/lots/bulk';

const ADMIN = '00000000-0000-0000-0000-000000000001';
const OFFICE = '00000000-0000-0000-0000-000000000002';

async function seed3Lots() {
  await testDb.insert(appUser).values([
    { id: ADMIN, role: 'admin', displayName: 'A' },
    { id: OFFICE, role: 'office', displayName: 'O' },
  ]);
  const [c] = await testDb.insert(customer).values({ name: 'C' }).returning();
  const [j] = await testDb.insert(job).values({ customerId: c.id, jobNumber: 'J' }).returning();
  const lots = await testDb.insert(lot).values([
    { jobId: j.id, lotNumber: 10, state: 'assigned', source: 'imported', intakeOperatorId: ADMIN },
    { jobId: j.id, lotNumber: 11, state: 'assigned', source: 'imported', intakeOperatorId: ADMIN },
    { jobId: j.id, lotNumber: 12, state: 'sold',     source: 'imported', intakeOperatorId: ADMIN },
  ]).returning();
  return { lotIds: lots.map(l => l.id), jobId: j.id, customerId: c.id };
}

async function call(body: unknown, role: 'admin' | 'office' = 'admin', userId = ADMIN): Promise<CallResult<any>> {
  const token = await mintTestJwt({ userId, role });
  return callHandler(handler, {
    method: 'POST', url: '/api/lots/bulk',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body,
  });
}

describe('POST /api/lots/bulk — change-state', () => {
  beforeEach(async () => { await truncateAll(); });

  it('all-success', async () => {
    const { lotIds } = await seed3Lots();
    const res = await call({ action: 'change-state', lotIds: lotIds.slice(0, 2), params: { to: 'sold' } });
    expect(res.status).toBe(200);
    expect(res.body.results).toHaveLength(2);
    expect(res.body.results.every((r: any) => r.ok)).toBe(true);
  });

  it('partial failure (mixed legality)', async () => {
    const { lotIds } = await seed3Lots();
    const res = await call({ action: 'change-state', lotIds, params: { to: 'sold' } });
    expect(res.status).toBe(200);
    const ok = res.body.results.filter((r: any) => r.ok);
    const fail = res.body.results.filter((r: any) => !r.ok);
    expect(ok).toHaveLength(2);
    expect(fail).toHaveLength(1);
    expect(fail[0].error.code).toBe('ILLEGAL_TRANSITION');
  });

  it('clears (jobId, lotNumber) when transitioning to unassigned', async () => {
    const { lotIds } = await seed3Lots();
    const res = await call({ action: 'change-state', lotIds: lotIds.slice(0, 2), params: { to: 'unassigned' } });
    expect(res.status).toBe(200);
    expect(res.body.results.every((r: any) => r.ok)).toBe(true);
    const [a] = await testDb.select().from(lot).where(eq(lot.id, lotIds[0]));
    expect(a.jobId).toBeNull();
    expect(a.lotNumber).toBeNull();
  });

  it('400 on missing params.to', async () => {
    const { lotIds } = await seed3Lots();
    const res = await call({ action: 'change-state', lotIds });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/lots/bulk — delete', () => {
  beforeEach(async () => { await truncateAll(); });

  it('admin can bulk-delete', async () => {
    const { lotIds } = await seed3Lots();
    const res = await call({ action: 'delete', lotIds });
    expect(res.status).toBe(200);
    expect(res.body.results.every((r: any) => r.ok)).toBe(true);
  });

  it('office cannot bulk-delete (403)', async () => {
    const { lotIds } = await seed3Lots();
    const res = await call({ action: 'delete', lotIds }, 'office', OFFICE);
    expect(res.status).toBe(403);
  });

  it('per-lot NOT_FOUND for unknown ids in delete batch', async () => {
    const { lotIds } = await seed3Lots();
    const mixed = [lotIds[0], '00000000-0000-0000-0000-000000000099'];
    const res = await call({ action: 'delete', lotIds: mixed });
    expect(res.status).toBe(200);
    const fail = res.body.results.filter((r: any) => !r.ok);
    expect(fail).toHaveLength(1);
    expect(fail[0].error.code).toBe('NOT_FOUND');
  });
});

describe('POST /api/lots/bulk — move', () => {
  beforeEach(async () => { await truncateAll(); });

  it('admin moves multiple assigned lots to a destination job, allocating sequential lot_numbers', async () => {
    const { lotIds, customerId } = await seed3Lots();
    const [j2] = await testDb.insert(job).values({ customerId, jobNumber: 'J2' }).returning();
    // Move the first 2 (both assigned). Third lot is sold — exclude from this test.
    const res = await call({ action: 'move', lotIds: lotIds.slice(0, 2), params: { destinationJobId: j2.id } });
    expect(res.status).toBe(200);
    expect(res.body.results.every((r: any) => r.ok)).toBe(true);
    const [a] = await testDb.select().from(lot).where(eq(lot.id, lotIds[0]));
    const [b] = await testDb.select().from(lot).where(eq(lot.id, lotIds[1]));
    expect(a.jobId).toBe(j2.id);
    expect(b.jobId).toBe(j2.id);
    expect([a.lotNumber, b.lotNumber].sort()).toEqual([10, 11]);  // baseline 10, then 11
  });

  it('per-lot ILLEGAL_MOVE for sold lots in mixed batch (only assigned can move)', async () => {
    const { lotIds, customerId } = await seed3Lots();
    const [j2] = await testDb.insert(job).values({ customerId, jobNumber: 'J3' }).returning();
    const res = await call({ action: 'move', lotIds, params: { destinationJobId: j2.id } });
    expect(res.status).toBe(200);
    const ok = res.body.results.filter((r: any) => r.ok);
    const fail = res.body.results.filter((r: any) => !r.ok);
    expect(ok).toHaveLength(2);                  // first 2 are assigned
    expect(fail).toHaveLength(1);                // third is sold
    expect(fail[0].error.code).toBe('ILLEGAL_MOVE');
  });

  it('per-lot INVALID_DESTINATION when destination job does not exist', async () => {
    const { lotIds } = await seed3Lots();
    const res = await call({ action: 'move', lotIds: lotIds.slice(0, 1), params: { destinationJobId: '00000000-0000-0000-0000-000000000099' } });
    expect(res.status).toBe(200);
    expect(res.body.results[0].ok).toBe(false);
    expect(res.body.results[0].error.code).toBe('INVALID_DESTINATION');
  });

  it('400 on missing params.destinationJobId', async () => {
    const { lotIds } = await seed3Lots();
    const res = await call({ action: 'move', lotIds });
    expect(res.status).toBe(400);
  });

  it('moves unassigned lots, transitioning state to assigned', async () => {
    const { lotIds, customerId } = await seed3Lots();
    // Move first lot to unassigned via direct DB update
    await testDb.update(lot).set({ state: 'unassigned', jobId: null, lotNumber: null }).where(eq(lot.id, lotIds[0]));
    const [j2] = await testDb.insert(job).values({ customerId, jobNumber: 'J-DEST' }).returning();
    const res = await call({ action: 'move', lotIds: [lotIds[0]], params: { destinationJobId: j2.id } });
    expect(res.status).toBe(200);
    expect(res.body.results[0].ok).toBe(true);
    const [moved] = await testDb.select().from(lot).where(eq(lot.id, lotIds[0]));
    expect(moved.state).toBe('assigned');
    expect(moved.jobId).toBe(j2.id);
  });
});

describe('POST /api/lots/bulk — validation', () => {
  beforeEach(async () => { await truncateAll(); });

  it('400 on invalid action', async () => {
    const { lotIds } = await seed3Lots();
    const res = await call({ action: 'invade', lotIds });
    expect(res.status).toBe(400);
  });

  it('400 on empty lotIds', async () => {
    await seed3Lots();
    const res = await call({ action: 'delete', lotIds: [] });
    expect(res.status).toBe(400);
  });

  it('400 on invalid params.to (not a valid state)', async () => {
    const { lotIds } = await seed3Lots();
    const res = await call({ action: 'change-state', lotIds, params: { to: 'deleted' } });
    expect(res.status).toBe(400);
  });
});
