import { describe, it, expect, beforeEach } from 'vitest';
import { testDb, truncateAll } from '../helpers/test-db';
import { mintTestJwt } from '../helpers/test-jwt';
import { appUser } from '../../db/schema';
import handler from '../../api/customers/index';
import idHandler from '../../api/customers/[id]';

const ADMIN = '00000000-0000-0000-0000-000000000001';
const OFFICE = '00000000-0000-0000-0000-000000000002';
const WAREHOUSE = '00000000-0000-0000-0000-000000000003';

async function seedUsers() {
  await testDb.insert(appUser).values([
    { id: ADMIN, role: 'admin', displayName: 'Admin' },
    { id: OFFICE, role: 'office', displayName: 'Office' },
    { id: WAREHOUSE, role: 'warehouse', displayName: 'Warehouse' },
  ]);
}

async function call(method: string, body: unknown, role: 'admin' | 'office' | 'warehouse', userId: string) {
  const token = await mintTestJwt({ userId, role });
  const req = new Request('http://test/api/customers', {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  return handler(req);
}

describe('POST /api/customers', () => {
  beforeEach(async () => {
    await truncateAll();
    await seedUsers();
  });

  it('admin can create a customer', async () => {
    const res = await call('POST', { name: 'Smith Estate' }, 'admin', ADMIN);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.name).toBe('Smith Estate');
    expect(body.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('office can create a customer', async () => {
    const res = await call('POST', { name: 'Jones Family' }, 'office', OFFICE);
    expect(res.status).toBe(201);
  });

  it('warehouse cannot create a customer', async () => {
    const res = await call('POST', { name: 'Nope' }, 'warehouse', WAREHOUSE);
    expect(res.status).toBe(403);
  });

  it('rejects empty name', async () => {
    const res = await call('POST', { name: '' }, 'admin', ADMIN);
    expect(res.status).toBe(400);
  });

  it('rejects missing auth', async () => {
    const req = new Request('http://test/api/customers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'X' }),
    });
    const res = await handler(req);
    expect(res.status).toBe(401);
  });
});

describe('GET /api/customers', () => {
  beforeEach(async () => {
    await truncateAll();
    await seedUsers();
  });

  it('lists customers for any authenticated role', async () => {
    await call('POST', { name: 'A' }, 'admin', ADMIN);
    await call('POST', { name: 'B' }, 'admin', ADMIN);
    const res = await call('GET', null, 'warehouse', WAREHOUSE);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.customers).toHaveLength(2);
    expect(body.customers.map((c: any) => c.name).sort()).toEqual(['A', 'B']);
  });
});

async function callId(id: string, method: string, body: unknown, role: 'admin' | 'office' | 'warehouse', userId: string) {
  const token = await mintTestJwt({ userId, role });
  return idHandler(new Request(`http://test/api/customers/${id}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  }));
}

describe('PATCH /api/customers/:id', () => {
  beforeEach(async () => { await truncateAll(); await seedUsers(); });

  it('admin updates name', async () => {
    const created = await (await call('POST', { name: 'Old' }, 'admin', ADMIN)).json();
    const res = await callId(created.id, 'PATCH', { name: 'New' }, 'admin', ADMIN);
    expect(res.status).toBe(200);
    expect((await res.json()).name).toBe('New');
  });

  it('warehouse cannot update', async () => {
    const created = await (await call('POST', { name: 'X' }, 'admin', ADMIN)).json();
    const res = await callId(created.id, 'PATCH', { name: 'Y' }, 'warehouse', WAREHOUSE);
    expect(res.status).toBe(403);
  });
});

describe('DELETE /api/customers/:id', () => {
  beforeEach(async () => { await truncateAll(); await seedUsers(); });

  it('admin deletes', async () => {
    const created = await (await call('POST', { name: 'X' }, 'admin', ADMIN)).json();
    const res = await callId(created.id, 'DELETE', null, 'admin', ADMIN);
    expect(res.status).toBe(200);
  });

  it('office cannot delete', async () => {
    const created = await (await call('POST', { name: 'X' }, 'admin', ADMIN)).json();
    const res = await callId(created.id, 'DELETE', null, 'office', OFFICE);
    expect(res.status).toBe(403);
  });
});
