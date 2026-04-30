import { describe, it, expect, beforeEach } from 'vitest';
import { testDb, truncateAll } from '../helpers/test-db';
import { mintTestJwt } from '../helpers/test-jwt';
import { appUser } from '../../db/schema';
import { testFetch as indexHandler } from '../../api/users/index';
import { testFetch as idHandler } from '../../api/users/[id]';

const ADMIN = '00000000-0000-0000-0000-000000000001';
const OFFICE = '00000000-0000-0000-0000-000000000002';

async function seedUsers() {
  await testDb.insert(appUser).values([
    { id: ADMIN, role: 'admin', displayName: 'Admin' },
    { id: OFFICE, role: 'office', displayName: 'Office' },
  ]);
}

async function call(handler: any, url: string, method: string, body: unknown, role: 'admin' | 'office' | 'warehouse', userId: string) {
  const token = await mintTestJwt({ userId, role });
  return handler(new Request(`http://test${url}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  }));
}

describe('GET /api/users', () => {
  beforeEach(async () => { await truncateAll(); await seedUsers(); });

  it('admin lists users', async () => {
    const res = await call(indexHandler, '/api/users', 'GET', null, 'admin', ADMIN);
    expect(res.status).toBe(200);
    expect((await res.json()).users).toHaveLength(2);
  });

  it('office is forbidden', async () => {
    const res = await call(indexHandler, '/api/users', 'GET', null, 'office', OFFICE);
    expect(res.status).toBe(403);
  });
});

describe('PATCH /api/users/:id', () => {
  beforeEach(async () => { await truncateAll(); await seedUsers(); });

  it('admin changes role', async () => {
    const res = await call(idHandler, `/api/users/${OFFICE}`, 'PATCH', { role: 'warehouse' }, 'admin', ADMIN);
    expect(res.status).toBe(200);
    expect((await res.json()).role).toBe('warehouse');
  });

  it('office cannot change roles', async () => {
    const res = await call(idHandler, `/api/users/${ADMIN}`, 'PATCH', { role: 'warehouse' }, 'office', OFFICE);
    expect(res.status).toBe(403);
  });
});
