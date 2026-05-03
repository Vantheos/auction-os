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

  it('admin disables and re-enables another user', async () => {
    const disable = await callId(OFFICE, 'PATCH', { disabled: true }, 'admin', ADMIN);
    expect(disable.status).toBe(200);
    expect(disable.body.disabledAt).toBeTruthy();

    const reenable = await callId(OFFICE, 'PATCH', { disabled: false }, 'admin', ADMIN);
    expect(reenable.status).toBe(200);
    expect(reenable.body.disabledAt).toBeNull();
  });

  it('admin cannot disable own account (CANNOT_DISABLE_SELF)', async () => {
    const res = await callId(ADMIN, 'PATCH', { disabled: true }, 'admin', ADMIN);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CANNOT_DISABLE_SELF');
  });

  it('admin can disable self with disabled=false (no-op self-enable; not blocked)', async () => {
    // Self-disable rule only blocks disabled=true. Self-PATCH with disabled=false
    // is fine (idempotent — admin is already active) and useful as a sanity check
    // that the rule is precisely scoped.
    const res = await callId(ADMIN, 'PATCH', { disabled: false }, 'admin', ADMIN);
    expect(res.status).toBe(200);
  });

  it('cannot demote the last active admin (CANNOT_REMOVE_LAST_ADMIN)', async () => {
    const res = await callId(ADMIN, 'PATCH', { role: 'office' }, 'admin', ADMIN);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CANNOT_REMOVE_LAST_ADMIN');
  });

  it('can disable an admin when other active admins exist', async () => {
    const SECOND_ADMIN = '00000000-0000-0000-0000-000000000003';
    await testDb.insert(appUser).values({ id: SECOND_ADMIN, role: 'admin', displayName: 'Admin 2' });

    const res = await callId(SECOND_ADMIN, 'PATCH', { disabled: true }, 'admin', ADMIN);
    expect(res.status).toBe(200);
    expect(res.body.disabledAt).toBeTruthy();
  });
});
