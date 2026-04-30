import { describe, it, expect, beforeEach } from 'vitest';
import { testDb, truncateAll } from '../helpers/test-db';
import { mintTestJwt } from '../helpers/test-jwt';
import { callHandler, type CallResult } from '../helpers/call-handler';
import { appUser, customer as customerTable } from '../../db/schema';
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
