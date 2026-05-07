import { describe, it, expect, beforeEach } from 'vitest';
import { testDb, truncateAll } from '../helpers/test-db';
import { mintTestJwt } from '../helpers/test-jwt';
import { callHandler, type CallResult } from '../helpers/call-handler';
import { appUser, customer as customerTable, lot } from '../../db/schema';
import { eq } from 'drizzle-orm';
import indexHandler from '../../api/jobs/index';
import idHandler from '../../api/jobs/[id]';

const ADMIN = '00000000-0000-0000-0000-000000000001';
const WAREHOUSE = '00000000-0000-0000-0000-000000000003';

async function seedUsersAndCustomer() {
  await testDb.insert(appUser).values([
    { id: ADMIN, role: 'admin', displayName: 'Admin' },
    { id: WAREHOUSE, role: 'warehouse', displayName: 'Warehouse' },
  ]);
  const [c] = await testDb.insert(customerTable).values({ name: 'Smith Estate' }).returning();
  return c.id;
}

async function callIndex(url: string, method: string, body: unknown, role: 'admin' | 'office' | 'warehouse', userId: string): Promise<CallResult<any>> {
  const token = await mintTestJwt({ userId, role });
  return callHandler(indexHandler, {
    method,
    url,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body ?? undefined,
  });
}

async function callId(id: string, method: string, body: unknown, role: 'admin' | 'office' | 'warehouse', userId: string): Promise<CallResult<any>> {
  const token = await mintTestJwt({ userId, role });
  return callHandler(idHandler, {
    method,
    url: `/api/jobs/${id}?id=${id}`,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body ?? undefined,
  });
}

describe('POST /api/jobs', () => {
  let customerId: string;
  beforeEach(async () => { await truncateAll(); customerId = await seedUsersAndCustomer(); });

  it('admin creates a job for a customer', async () => {
    const res = await callIndex('/api/jobs', 'POST', { customerId, jobNumber: '2026-04-Smith-001' }, 'admin', ADMIN);
    expect(res.status).toBe(201);
    expect(res.body.jobNumber).toBe('2026-04-Smith-001');
    expect(res.body.customerId).toBe(customerId);
    expect(res.body.closedAt).toBeNull();
  });

  it('rejects duplicate (customerId, jobNumber)', async () => {
    await callIndex('/api/jobs', 'POST', { customerId, jobNumber: 'X' }, 'admin', ADMIN);
    const res = await callIndex('/api/jobs', 'POST', { customerId, jobNumber: 'X' }, 'admin', ADMIN);
    expect(res.status).toBe(409);
  });

  it('warehouse cannot create', async () => {
    const res = await callIndex('/api/jobs', 'POST', { customerId, jobNumber: 'Y' }, 'warehouse', WAREHOUSE);
    expect(res.status).toBe(403);
  });
});

describe('GET /api/jobs?customerId=...', () => {
  let customerId: string;
  beforeEach(async () => { await truncateAll(); customerId = await seedUsersAndCustomer(); });

  it('lists jobs filtered by customerId', async () => {
    await callIndex('/api/jobs', 'POST', { customerId, jobNumber: 'A' }, 'admin', ADMIN);
    await callIndex('/api/jobs', 'POST', { customerId, jobNumber: 'B' }, 'admin', ADMIN);
    const res = await callIndex(`/api/jobs?customerId=${customerId}`, 'GET', null, 'warehouse', WAREHOUSE);
    expect(res.status).toBe(200);
    expect(res.body.jobs).toHaveLength(2);
  });
});

describe('GET /api/jobs/:id — assignedLotCount', () => {
  let customerId: string;
  let jobId: string;
  beforeEach(async () => {
    await truncateAll();
    customerId = await seedUsersAndCustomer();
    const created = (await callIndex('/api/jobs', 'POST', { customerId, jobNumber: 'EXPORT-1' }, 'admin', ADMIN)).body;
    jobId = created.id;
  });

  it('returns assignedLotCount = 0 when the job has no lots', async () => {
    const res = await callId(jobId, 'GET', null, 'admin', ADMIN);
    expect(res.status).toBe(200);
    expect(res.body.assignedLotCount).toBe(0);
  });

  it('counts only lots in assigned state for this job', async () => {
    // 2 assigned (the count) + 1 sold + 1 picked-up + 1 belonging to another job
    await testDb.insert(lot).values([
      { jobId, lotNumber: 1, state: 'assigned', source: 'imported', intakeOperatorId: ADMIN, quantity: 1 },
      { jobId, lotNumber: 2, state: 'assigned', source: 'imported', intakeOperatorId: ADMIN, quantity: 1 },
      { jobId, lotNumber: 3, state: 'sold', source: 'imported', intakeOperatorId: ADMIN, quantity: 1 },
      { jobId, lotNumber: 4, state: 'picked-up', source: 'imported', intakeOperatorId: ADMIN, quantity: 1 },
    ]);
    const otherJob = (await callIndex('/api/jobs', 'POST', { customerId, jobNumber: 'EXPORT-2' }, 'admin', ADMIN)).body;
    await testDb.insert(lot).values({
      jobId: otherJob.id, lotNumber: 1, state: 'assigned', source: 'imported', intakeOperatorId: ADMIN, quantity: 1,
    });

    const res = await callId(jobId, 'GET', null, 'admin', ADMIN);
    expect(res.body.assignedLotCount).toBe(2);
  });

  it('decrements assignedLotCount when an assigned lot becomes sold', async () => {
    const [l] = await testDb.insert(lot).values({
      jobId, lotNumber: 1, state: 'assigned', source: 'imported', intakeOperatorId: ADMIN, quantity: 1,
    }).returning();
    expect((await callId(jobId, 'GET', null, 'admin', ADMIN)).body.assignedLotCount).toBe(1);

    await testDb.update(lot).set({ state: 'sold' }).where(eq(lot.id, l.id));
    expect((await callId(jobId, 'GET', null, 'admin', ADMIN)).body.assignedLotCount).toBe(0);
  });
});

describe('PATCH /api/jobs/:id (close/reopen)', () => {
  let customerId: string;
  beforeEach(async () => { await truncateAll(); customerId = await seedUsersAndCustomer(); });

  it('admin closes a job', async () => {
    const created = (await callIndex('/api/jobs', 'POST', { customerId, jobNumber: 'C' }, 'admin', ADMIN)).body;
    const res = await callId(created.id, 'PATCH', { closed: true }, 'admin', ADMIN);
    expect(res.status).toBe(200);
    expect(res.body.closedAt).not.toBeNull();
  });

  it('admin reopens a job', async () => {
    const created = (await callIndex('/api/jobs', 'POST', { customerId, jobNumber: 'D' }, 'admin', ADMIN)).body;
    await callId(created.id, 'PATCH', { closed: true }, 'admin', ADMIN);
    const res = await callId(created.id, 'PATCH', { closed: false }, 'admin', ADMIN);
    expect(res.status).toBe(200);
    expect(res.body.closedAt).toBeNull();
  });
});
