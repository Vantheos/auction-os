// tests/api/lots-id.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { testDb, truncateAll } from '../helpers/test-db';
import { mintTestJwt } from '../helpers/test-jwt';
import { callHandler, type CallResult } from '../helpers/call-handler';
import { appUser, customer, job, lot } from '../../db/schema';
import handler from '../../api/lots/[id]';

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
  const [j] = await testDb.insert(job).values({ customerId: c.id, jobNumber: 'X-001' }).returning();
  const [l] = await testDb.insert(lot).values({
    jobId: j.id, lotNumber: 10, state: 'assigned', source: 'imported', intakeOperatorId: WAREHOUSE,
  }).returning();
  return { lotId: l.id, jobId: j.id };
}

async function call(id: string, method: string, body: unknown, role: 'admin' | 'office' | 'warehouse', userId: string): Promise<CallResult<any>> {
  const token = await mintTestJwt({ userId, role });
  return callHandler(handler, {
    method, url: `/api/lots/${id}?id=${id}`,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body ?? undefined,
  });
}

describe('GET /api/lots/[id]', () => {
  beforeEach(async () => { await truncateAll(); });
  it('returns the lot with customer + job joined', async () => {
    const { lotId } = await seed();
    const res = await call(lotId, 'GET', null, 'admin', ADMIN);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(lotId);
    expect(res.body.customerName).toBe('Smith');
    expect(res.body.jobNumber).toBe('X-001');
  });
  it('404 on unknown id', async () => {
    await seed();
    const res = await call('00000000-0000-0000-0000-000000000099', 'GET', null, 'admin', ADMIN);
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/lots/[id]', () => {
  beforeEach(async () => { await truncateAll(); });

  it('admin updates editable fields', async () => {
    const { lotId } = await seed();
    const res = await call(lotId, 'PATCH', { title: 'Antique Vase', price: '45.00' }, 'admin', ADMIN);
    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Antique Vase');
    expect(res.body.price).toBe('45.00');
  });

  it('warehouse cannot edit fields', async () => {
    const { lotId } = await seed();
    const res = await call(lotId, 'PATCH', { title: 'X' }, 'warehouse', WAREHOUSE);
    expect(res.status).toBe(403);
  });

  it('legal state transition: assigned → sold', async () => {
    const { lotId } = await seed();
    const res = await call(lotId, 'PATCH', { state: 'sold' }, 'office', OFFICE);
    expect(res.status).toBe(200);
    expect(res.body.state).toBe('sold');
  });

  it('illegal state transition returns 422 ILLEGAL_TRANSITION', async () => {
    const { lotId } = await seed();
    await call(lotId, 'PATCH', { state: 'sold' }, 'admin', ADMIN);
    await call(lotId, 'PATCH', { state: 'picked-up' }, 'admin', ADMIN);
    const res = await call(lotId, 'PATCH', { state: 'assigned' }, 'admin', ADMIN);  // picked-up is terminal
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('ILLEGAL_TRANSITION');
  });

  it('transitioning to unassigned clears (job, lot_number)', async () => {
    const { lotId } = await seed();
    const res = await call(lotId, 'PATCH', { state: 'unassigned' }, 'admin', ADMIN);
    expect(res.status).toBe(200);
    expect(res.body.jobId).toBeNull();
    expect(res.body.lotNumber).toBeNull();
  });

  it('404 on PATCH of unknown id', async () => {
    await seed();
    const res = await call('00000000-0000-0000-0000-000000000099', 'PATCH', { title: 'X' }, 'admin', ADMIN);
    expect(res.status).toBe(404);
  });

  it('rejects field edits on sold lots (sold is frozen)', async () => {
    const { lotId } = await seed();
    await call(lotId, 'PATCH', { state: 'sold' }, 'admin', ADMIN);
    const res = await call(lotId, 'PATCH', { title: 'New title' }, 'admin', ADMIN);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('FROZEN');
  });

  it('allows state-only PATCH on sold lots (e.g., sold → picked-up)', async () => {
    const { lotId } = await seed();
    await call(lotId, 'PATCH', { state: 'sold' }, 'admin', ADMIN);
    const res = await call(lotId, 'PATCH', { state: 'picked-up' }, 'admin', ADMIN);
    expect(res.status).toBe(200);
    expect(res.body.state).toBe('picked-up');
  });
});

describe('DELETE /api/lots/[id]', () => {
  beforeEach(async () => { await truncateAll(); });
  it('admin can delete', async () => {
    const { lotId } = await seed();
    const res = await call(lotId, 'DELETE', null, 'admin', ADMIN);
    expect(res.status).toBe(200);
  });
  it('office cannot delete', async () => {
    const { lotId } = await seed();
    const res = await call(lotId, 'DELETE', null, 'office', OFFICE);
    expect(res.status).toBe(403);
  });

  it('404 on delete of unknown id', async () => {
    await seed();
    const res = await call('00000000-0000-0000-0000-000000000099', 'DELETE', null, 'admin', ADMIN);
    expect(res.status).toBe(404);
  });
});
