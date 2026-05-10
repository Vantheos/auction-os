import { describe, it, expect, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { testDb, truncateAll } from '../helpers/test-db';
import { mintTestJwt } from '../helpers/test-jwt';
import { callHandler, type CallResult } from '../helpers/call-handler';
import { appUser, customer as customerTable, job, lot } from '../../db/schema';
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

  it('each job in the list includes lot counts powering the AF360 gate', async () => {
    // Job A: 2 fully ready + 1 missing-title-assigned + 1 sold (still complete) + 1 assigned-NULL-price
    // Job B: empty (all counts zero)
    const a = (await callIndex('/api/jobs', 'POST', { customerId, jobNumber: 'A' }, 'admin', ADMIN)).body;
    await callIndex('/api/jobs', 'POST', { customerId, jobNumber: 'B' }, 'admin', ADMIN);
    await testDb.insert(lot).values([
      { jobId: a.id, lotNumber: 1, state: 'assigned', source: 'imported', intakeOperatorId: ADMIN, quantity: 1,
        title: 'A', description: 'a', price: '1.00' },
      { jobId: a.id, lotNumber: 2, state: 'assigned', source: 'imported', intakeOperatorId: ADMIN, quantity: 1,
        title: 'B', description: 'b', price: '2.00' },
      { jobId: a.id, lotNumber: 3, state: 'assigned', source: 'imported', intakeOperatorId: ADMIN, quantity: 1,
        title: null, description: 'c', price: '3.00' },
      { jobId: a.id, lotNumber: 4, state: 'sold', source: 'imported', intakeOperatorId: ADMIN, quantity: 1,
        title: 'D', description: 'd', price: '4.00' },
      { jobId: a.id, lotNumber: 5, state: 'assigned', source: 'imported', intakeOperatorId: ADMIN, quantity: 1,
        title: 'E', description: 'e', price: null },
    ]);
    const res = await callIndex(`/api/jobs?customerId=${customerId}`, 'GET', null, 'admin', ADMIN);
    const byNumber = Object.fromEntries(res.body.jobs.map((j: any) => [j.jobNumber, j]));
    expect(byNumber.A).toMatchObject({
      totalLotCount: 5,
      assignedLotCount: 4,
      exportReadyLotCount: 2,
    });
    expect(byNumber.B).toMatchObject({
      totalLotCount: 0,
      assignedLotCount: 0,
      exportReadyLotCount: 0,
    });
  });

  it('counts are scoped per job — lots in a sibling customer\'s job do not leak in', async () => {
    const a = (await callIndex('/api/jobs', 'POST', { customerId, jobNumber: 'A' }, 'admin', ADMIN)).body;
    const [otherCustomer] = await testDb.insert(customerTable).values({ name: 'Other' }).returning();
    const otherJob = (await callIndex('/api/jobs', 'POST', { customerId: otherCustomer.id, jobNumber: 'OTHER' }, 'admin', ADMIN)).body;
    await testDb.insert(lot).values([
      { jobId: a.id, lotNumber: 1, state: 'assigned', source: 'imported', intakeOperatorId: ADMIN, quantity: 1,
        title: 'A', description: 'a', price: '1.00' },
      { jobId: otherJob.id, lotNumber: 1, state: 'assigned', source: 'imported', intakeOperatorId: ADMIN, quantity: 1,
        title: 'X', description: 'x', price: '9.00' },
    ]);
    const res = await callIndex(`/api/jobs?customerId=${customerId}`, 'GET', null, 'admin', ADMIN);
    expect(res.body.jobs).toHaveLength(1);
    expect(res.body.jobs[0]).toMatchObject({
      jobNumber: 'A',
      totalLotCount: 1,
      assignedLotCount: 1,
      exportReadyLotCount: 1,
    });
  });
});

describe('GET /api/jobs/:id — lot counts', () => {
  let customerId: string;
  let jobId: string;
  beforeEach(async () => {
    await truncateAll();
    customerId = await seedUsersAndCustomer();
    const created = (await callIndex('/api/jobs', 'POST', { customerId, jobNumber: 'EXPORT-1' }, 'admin', ADMIN)).body;
    jobId = created.id;
  });

  it('all counts are zero when the job has no lots', async () => {
    const res = await callId(jobId, 'GET', null, 'admin', ADMIN);
    expect(res.status).toBe(200);
    expect(res.body.assignedLotCount).toBe(0);
    expect(res.body.totalLotCount).toBe(0);
    expect(res.body.exportReadyLotCount).toBe(0);
  });

  it('counts only lots belonging to this job', async () => {
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
    expect(res.body.totalLotCount).toBe(4);
  });

  it('exportReadyLotCount counts only assigned lots with title + description + price all populated', async () => {
    // 2 fully ready + 1 assigned-but-missing-title + 1 sold-but-complete + 1 assigned-but-NULL-price
    await testDb.insert(lot).values([
      { jobId, lotNumber: 1, state: 'assigned', source: 'imported', intakeOperatorId: ADMIN, quantity: 1,
        title: 'A', description: 'a', price: '1.00' },
      { jobId, lotNumber: 2, state: 'assigned', source: 'imported', intakeOperatorId: ADMIN, quantity: 1,
        title: 'B', description: 'b', price: '2.00' },
      { jobId, lotNumber: 3, state: 'assigned', source: 'imported', intakeOperatorId: ADMIN, quantity: 1,
        title: null, description: 'c', price: '3.00' },
      { jobId, lotNumber: 4, state: 'sold', source: 'imported', intakeOperatorId: ADMIN, quantity: 1,
        title: 'D', description: 'd', price: '4.00' },
      { jobId, lotNumber: 5, state: 'assigned', source: 'imported', intakeOperatorId: ADMIN, quantity: 1,
        title: 'E', description: 'e', price: null },
    ]);
    const res = await callId(jobId, 'GET', null, 'admin', ADMIN);
    expect(res.body.totalLotCount).toBe(5);
    expect(res.body.assignedLotCount).toBe(4);
    expect(res.body.exportReadyLotCount).toBe(2);
  });

  it('treats empty-string title or description as not ready', async () => {
    await testDb.insert(lot).values([
      { jobId, lotNumber: 1, state: 'assigned', source: 'imported', intakeOperatorId: ADMIN, quantity: 1,
        title: '', description: 'd', price: '1.00' },
      { jobId, lotNumber: 2, state: 'assigned', source: 'imported', intakeOperatorId: ADMIN, quantity: 1,
        title: 't', description: '', price: '1.00' },
    ]);
    const res = await callId(jobId, 'GET', null, 'admin', ADMIN);
    expect(res.body.totalLotCount).toBe(2);
    expect(res.body.assignedLotCount).toBe(2);
    expect(res.body.exportReadyLotCount).toBe(0);
  });

  it('"all ready" state: every lot is assigned and complete → exportReady === total', async () => {
    await testDb.insert(lot).values([
      { jobId, lotNumber: 1, state: 'assigned', source: 'imported', intakeOperatorId: ADMIN, quantity: 1,
        title: 'A', description: 'a', price: '1.00' },
      { jobId, lotNumber: 2, state: 'assigned', source: 'imported', intakeOperatorId: ADMIN, quantity: 1,
        title: 'B', description: 'b', price: '2.00' },
    ]);
    const res = await callId(jobId, 'GET', null, 'admin', ADMIN);
    expect(res.body.totalLotCount).toBe(2);
    expect(res.body.exportReadyLotCount).toBe(2);
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

// Phase 7: cascade label_reprint_needed when job.jobNumber changes —
// every lot in this job has a stale printed-label job-tail line.
describe('PATCH /api/jobs/:id — label reprint cascade on jobNumber change', () => {
  let customerId: string;
  beforeEach(async () => { await truncateAll(); customerId = await seedUsersAndCustomer(); });

  async function seedTwoJobsWithLots() {
    const [j1] = await testDb.insert(job).values({ customerId, jobNumber: 'A' }).returning();
    const [j2] = await testDb.insert(job).values({ customerId, jobNumber: 'B' }).returning();
    const lots = await testDb.insert(lot).values([
      { jobId: j1.id, lotNumber: 10, state: 'assigned', source: 'imported', intakeOperatorId: ADMIN },
      { jobId: j1.id, lotNumber: 11, state: 'assigned', source: 'imported', intakeOperatorId: ADMIN },
      { jobId: j2.id, lotNumber: 10, state: 'assigned', source: 'imported', intakeOperatorId: ADMIN },
    ]).returning();
    return { j1: j1.id, j2: j2.id, lotIdsJ1: [lots[0].id, lots[1].id], lotIdsJ2: [lots[2].id] };
  }

  it('cascades flag to lots in the renamed job; sibling job lots untouched', async () => {
    const { j1, lotIdsJ1, lotIdsJ2 } = await seedTwoJobsWithLots();
    const res = await callId(j1, 'PATCH', { jobNumber: 'A-renamed' }, 'admin', ADMIN);
    expect(res.status).toBe(200);
    const rows = await testDb.select().from(lot);
    expect(rows.filter((l) => lotIdsJ1.includes(l.id)).every((l) => l.labelReprintNeeded === true)).toBe(true);
    expect(rows.filter((l) => lotIdsJ2.includes(l.id)).every((l) => l.labelReprintNeeded === false)).toBe(true);
  });

  it('does NOT cascade when only startBid changes', async () => {
    const { j1, lotIdsJ1 } = await seedTwoJobsWithLots();
    const res = await callId(j1, 'PATCH', { startBid: '7.50' }, 'admin', ADMIN);
    expect(res.status).toBe(200);
    const rows = await testDb.select().from(lot);
    expect(rows.filter((l) => lotIdsJ1.includes(l.id)).every((l) => l.labelReprintNeeded === false)).toBe(true);
  });

  it('does NOT cascade when only shippable changes', async () => {
    const { j1, lotIdsJ1 } = await seedTwoJobsWithLots();
    const res = await callId(j1, 'PATCH', { shippable: true }, 'admin', ADMIN);
    expect(res.status).toBe(200);
    const rows = await testDb.select().from(lot);
    expect(rows.filter((l) => lotIdsJ1.includes(l.id)).every((l) => l.labelReprintNeeded === false)).toBe(true);
  });

  it('does NOT cascade on closed toggle', async () => {
    const { j1, lotIdsJ1 } = await seedTwoJobsWithLots();
    const res = await callId(j1, 'PATCH', { closed: true }, 'admin', ADMIN);
    expect(res.status).toBe(200);
    const rows = await testDb.select().from(lot).where(eq(lot.id, lotIdsJ1[0]));
    expect(rows[0].labelReprintNeeded).toBe(false);
  });

  it('does NOT cascade when jobNumber PATCH provides the same value', async () => {
    const { j1, lotIdsJ1 } = await seedTwoJobsWithLots();
    const res = await callId(j1, 'PATCH', { jobNumber: 'A' }, 'admin', ADMIN);
    expect(res.status).toBe(200);
    const rows = await testDb.select().from(lot);
    expect(rows.filter((l) => lotIdsJ1.includes(l.id)).every((l) => l.labelReprintNeeded === false)).toBe(true);
  });
});
