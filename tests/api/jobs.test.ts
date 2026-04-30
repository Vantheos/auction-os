import { describe, it, expect, beforeEach } from 'vitest';
import { testDb, truncateAll } from '../helpers/test-db';
import { mintTestJwt } from '../helpers/test-jwt';
import { appUser, customer as customerTable } from '../../db/schema';
import { testFetch as indexHandler } from '../../api/jobs/index';
import { testFetch as idHandler } from '../../api/jobs/[id]';

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

async function call(handler: any, url: string, method: string, body: unknown, role: 'admin' | 'office' | 'warehouse', userId: string) {
  const token = await mintTestJwt({ userId, role });
  return handler(new Request(`http://test${url}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  }));
}

describe('POST /api/jobs', () => {
  let customerId: string;
  beforeEach(async () => { await truncateAll(); customerId = await seedUsersAndCustomer(); });

  it('admin creates a job for a customer', async () => {
    const res = await call(indexHandler, '/api/jobs', 'POST', { customerId, jobNumber: '2026-04-Smith-001' }, 'admin', ADMIN);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.jobNumber).toBe('2026-04-Smith-001');
    expect(body.customerId).toBe(customerId);
    expect(body.closedAt).toBeNull();
  });

  it('rejects duplicate (customerId, jobNumber)', async () => {
    await call(indexHandler, '/api/jobs', 'POST', { customerId, jobNumber: 'X' }, 'admin', ADMIN);
    const res = await call(indexHandler, '/api/jobs', 'POST', { customerId, jobNumber: 'X' }, 'admin', ADMIN);
    expect(res.status).toBe(409);
  });

  it('warehouse cannot create', async () => {
    const res = await call(indexHandler, '/api/jobs', 'POST', { customerId, jobNumber: 'Y' }, 'warehouse', WAREHOUSE);
    expect(res.status).toBe(403);
  });
});

describe('GET /api/jobs?customerId=...', () => {
  let customerId: string;
  beforeEach(async () => { await truncateAll(); customerId = await seedUsersAndCustomer(); });

  it('lists jobs filtered by customerId', async () => {
    await call(indexHandler, '/api/jobs', 'POST', { customerId, jobNumber: 'A' }, 'admin', ADMIN);
    await call(indexHandler, '/api/jobs', 'POST', { customerId, jobNumber: 'B' }, 'admin', ADMIN);
    const res = await call(indexHandler, `/api/jobs?customerId=${customerId}`, 'GET', null, 'warehouse', WAREHOUSE);
    expect(res.status).toBe(200);
    expect((await res.json()).jobs).toHaveLength(2);
  });
});

describe('PATCH /api/jobs/:id (close/reopen)', () => {
  let customerId: string;
  beforeEach(async () => { await truncateAll(); customerId = await seedUsersAndCustomer(); });

  it('admin closes a job', async () => {
    const created = await (await call(indexHandler, '/api/jobs', 'POST', { customerId, jobNumber: 'C' }, 'admin', ADMIN)).json();
    const res = await call(idHandler, `/api/jobs/${created.id}`, 'PATCH', { closed: true }, 'admin', ADMIN);
    expect(res.status).toBe(200);
    expect((await res.json()).closedAt).not.toBeNull();
  });

  it('admin reopens a job', async () => {
    const created = await (await call(indexHandler, '/api/jobs', 'POST', { customerId, jobNumber: 'D' }, 'admin', ADMIN)).json();
    await call(idHandler, `/api/jobs/${created.id}`, 'PATCH', { closed: true }, 'admin', ADMIN);
    const res = await call(idHandler, `/api/jobs/${created.id}`, 'PATCH', { closed: false }, 'admin', ADMIN);
    expect(res.status).toBe(200);
    expect((await res.json()).closedAt).toBeNull();
  });
});
