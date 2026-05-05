// tests/api/customer-disable.test.ts
// Phase 5 Area 2: validates disable / re-enable round-trip via the
// `disabled` boolean toggle on PATCH /api/customers/:id. Server translates
// the boolean to a disabledAt timestamp (true → now, false → null).

import { describe, it, expect, beforeEach } from 'vitest';
import { testDb, truncateAll } from '../helpers/test-db';
import { mintTestJwt } from '../helpers/test-jwt';
import { callHandler, type CallResult } from '../helpers/call-handler';
import { appUser } from '../../db/schema';
import indexHandler from '../../api/customers/index';
import idHandler from '../../api/customers/[id]';

const ADMIN = '00000000-0000-0000-0000-000000000001';
const WAREHOUSE = '00000000-0000-0000-0000-000000000003';

async function seedUsers() {
  await testDb.insert(appUser).values([
    { id: ADMIN, role: 'admin', displayName: 'Admin' },
    { id: WAREHOUSE, role: 'warehouse', displayName: 'Warehouse' },
  ]);
}

async function callCreate(body: unknown): Promise<CallResult<any>> {
  const token = await mintTestJwt({ userId: ADMIN, role: 'admin' });
  return callHandler(indexHandler, {
    method: 'POST',
    url: '/api/customers',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body,
  });
}

async function callPatch(id: string, body: unknown, userId = ADMIN, role: 'admin' | 'office' | 'warehouse' = 'admin'): Promise<CallResult<any>> {
  const token = await mintTestJwt({ userId, role });
  return callHandler(idHandler, {
    method: 'PATCH',
    url: `/api/customers/${id}?id=${id}`,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body,
  });
}

describe('PATCH /api/customers/:id — disabled toggle', () => {
  beforeEach(async () => {
    await truncateAll();
    await seedUsers();
  });

  it('disable=true sets disabledAt to a recent timestamp', async () => {
    const created = (await callCreate({ name: 'Acme', sellerCode: 'A1' })).body;
    expect(created.disabledAt).toBeNull();

    const before = Date.now();
    const res = await callPatch(created.id, { disabled: true });
    const after = Date.now();
    expect(res.status).toBe(200);
    expect(res.body.disabledAt).not.toBeNull();
    const ts = new Date(res.body.disabledAt).getTime();
    expect(ts).toBeGreaterThanOrEqual(before - 1000);
    expect(ts).toBeLessThanOrEqual(after + 1000);
  });

  it('disable=false clears disabledAt', async () => {
    const created = (await callCreate({ name: 'Acme', sellerCode: 'A1' })).body;
    await callPatch(created.id, { disabled: true });

    const res = await callPatch(created.id, { disabled: false });
    expect(res.status).toBe(200);
    expect(res.body.disabledAt).toBeNull();
  });

  it('round-trips disable → re-enable', async () => {
    const created = (await callCreate({ name: 'Acme', sellerCode: 'A1' })).body;

    const disabled = await callPatch(created.id, { disabled: true });
    expect(disabled.body.disabledAt).not.toBeNull();

    const enabled = await callPatch(created.id, { disabled: false });
    expect(enabled.body.disabledAt).toBeNull();

    const reDisabled = await callPatch(created.id, { disabled: true });
    expect(reDisabled.body.disabledAt).not.toBeNull();
  });

  it('warehouse cannot toggle disabled', async () => {
    const created = (await callCreate({ name: 'Acme', sellerCode: 'A1' })).body;
    const res = await callPatch(created.id, { disabled: true }, WAREHOUSE, 'warehouse');
    expect(res.status).toBe(403);
  });

  it('combined name + disabled update works in one call', async () => {
    const created = (await callCreate({ name: 'Acme', sellerCode: 'A1' })).body;
    const res = await callPatch(created.id, { name: 'Acme Renamed', disabled: true });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Acme Renamed');
    expect(res.body.disabledAt).not.toBeNull();
  });
});
