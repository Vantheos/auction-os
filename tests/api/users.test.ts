import { describe, it, expect, beforeEach } from 'vitest';
import { testDb, truncateAll } from '../helpers/test-db';
import { mintTestJwt } from '../helpers/test-jwt';
import { callHandler, type CallResult } from '../helpers/call-handler';
import { appUser } from '../../db/schema';
import indexHandler from '../../api/users/index';
import idHandler from '../../api/users/[id]';

const ADMIN = '00000000-0000-0000-0000-000000000001';
const OFFICE = '00000000-0000-0000-0000-000000000002';

async function seedUsers() {
  await testDb.insert(appUser).values([
    { id: ADMIN, role: 'admin', displayName: 'Admin' },
    { id: OFFICE, role: 'office', displayName: 'Office' },
  ]);
}

async function callIndex(method: string, body: unknown, role: 'admin' | 'office' | 'warehouse', userId: string): Promise<CallResult<any>> {
  const token = await mintTestJwt({ userId, role });
  return callHandler(indexHandler, {
    method,
    url: '/api/users',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body ?? undefined,
  });
}

async function callId(id: string, method: string, body: unknown, role: 'admin' | 'office' | 'warehouse', userId: string): Promise<CallResult<any>> {
  const token = await mintTestJwt({ userId, role });
  return callHandler(idHandler, {
    method,
    url: `/api/users/${id}?id=${id}`,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body ?? undefined,
  });
}

describe('GET /api/users', () => {
  beforeEach(async () => { await truncateAll(); await seedUsers(); });

  it('admin lists users', async () => {
    const res = await callIndex('GET', null, 'admin', ADMIN);
    expect(res.status).toBe(200);
    expect(res.body.users).toHaveLength(2);
  });

  it('office is forbidden', async () => {
    const res = await callIndex('GET', null, 'office', OFFICE);
    expect(res.status).toBe(403);
  });
});

describe('PATCH /api/users/:id', () => {
  beforeEach(async () => { await truncateAll(); await seedUsers(); });

  it('admin changes role', async () => {
    const res = await callId(OFFICE, 'PATCH', { role: 'warehouse' }, 'admin', ADMIN);
    expect(res.status).toBe(200);
    expect(res.body.role).toBe('warehouse');
  });

  it('office cannot change roles', async () => {
    const res = await callId(ADMIN, 'PATCH', { role: 'warehouse' }, 'office', OFFICE);
    expect(res.status).toBe(403);
  });
});
