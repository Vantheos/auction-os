// tests/api/job-export-fields.test.ts
// Phase 5 Area 3 — POST + PATCH validation for the new Job-level export
// defaults: startBid (numeric currency string) and shippable (boolean).

import { describe, it, expect, beforeEach } from 'vitest';
import { testDb, truncateAll } from '../helpers/test-db';
import { mintTestJwt } from '../helpers/test-jwt';
import { callHandler, type CallResult } from '../helpers/call-handler';
import { appUser, customer as customerTable } from '../../db/schema';
import indexHandler from '../../api/jobs/index';
import idHandler from '../../api/jobs/[id]';

const ADMIN = '00000000-0000-0000-0000-000000000001';

async function seedUsersAndCustomer(): Promise<string> {
  await testDb.insert(appUser).values([
    { id: ADMIN, role: 'admin', displayName: 'Admin' },
  ]);
  const [c] = await testDb.insert(customerTable).values({ name: 'Acme', sellerCode: 'ACME001' }).returning();
  return c.id;
}

async function callCreate(body: unknown): Promise<CallResult<any>> {
  const token = await mintTestJwt({ userId: ADMIN, role: 'admin' });
  return callHandler(indexHandler, {
    method: 'POST',
    url: '/api/jobs',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body,
  });
}

async function callPatch(id: string, body: unknown): Promise<CallResult<any>> {
  const token = await mintTestJwt({ userId: ADMIN, role: 'admin' });
  return callHandler(idHandler, {
    method: 'PATCH',
    url: `/api/jobs/${id}?id=${id}`,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body,
  });
}

describe('POST /api/jobs — startBid + shippable defaults', () => {
  let customerId: string;
  beforeEach(async () => { await truncateAll(); customerId = await seedUsersAndCustomer(); });

  it('uses DB defaults when fields are omitted', async () => {
    const res = await callCreate({ customerId, jobNumber: 'D-DEFAULTS' });
    expect(res.status).toBe(201);
    expect(res.body.startBid).toBe('5.00');
    expect(res.body.shippable).toBe(false);
  });

  it('persists explicit startBid and shippable values', async () => {
    const res = await callCreate({
      customerId,
      jobNumber: 'D-EXPLICIT',
      startBid: '10.00',
      shippable: true,
    });
    expect(res.status).toBe(201);
    expect(res.body.startBid).toBe('10.00');
    expect(res.body.shippable).toBe(true);
  });

  it('rejects malformed startBid (non-decimal string)', async () => {
    const res = await callCreate({ customerId, jobNumber: 'D-BAD', startBid: 'five' });
    expect(res.status).toBe(400);
  });

  it('rejects negative-looking startBid', async () => {
    const res = await callCreate({ customerId, jobNumber: 'D-NEG', startBid: '-1.00' });
    expect(res.status).toBe(400);
  });

  it('accepts zero startBid', async () => {
    const res = await callCreate({ customerId, jobNumber: 'D-ZERO', startBid: '0.00' });
    expect(res.status).toBe(201);
    expect(res.body.startBid).toBe('0.00');
  });
});

describe('PATCH /api/jobs/:id — startBid + shippable updates', () => {
  let customerId: string;
  beforeEach(async () => { await truncateAll(); customerId = await seedUsersAndCustomer(); });

  it('updates startBid in place', async () => {
    const created = (await callCreate({ customerId, jobNumber: 'P1' })).body;
    const res = await callPatch(created.id, { startBid: '7.50' });
    expect(res.status).toBe(200);
    expect(res.body.startBid).toBe('7.50');
  });

  it('updates shippable in place', async () => {
    const created = (await callCreate({ customerId, jobNumber: 'P2' })).body;
    const res = await callPatch(created.id, { shippable: true });
    expect(res.status).toBe(200);
    expect(res.body.shippable).toBe(true);
  });

  it('updates jobNumber + startBid + shippable in one call', async () => {
    const created = (await callCreate({ customerId, jobNumber: 'P3' })).body;
    const res = await callPatch(created.id, { jobNumber: 'P3-RENAMED', startBid: '15.00', shippable: true });
    expect(res.status).toBe(200);
    expect(res.body.jobNumber).toBe('P3-RENAMED');
    expect(res.body.startBid).toBe('15.00');
    expect(res.body.shippable).toBe(true);
  });

  it('rejects malformed startBid on PATCH', async () => {
    const created = (await callCreate({ customerId, jobNumber: 'P4' })).body;
    const res = await callPatch(created.id, { startBid: 'abc' });
    expect(res.status).toBe(400);
  });

  it('preserves untouched fields on partial update', async () => {
    const created = (await callCreate({ customerId, jobNumber: 'P5', startBid: '12.00', shippable: true })).body;
    const res = await callPatch(created.id, { jobNumber: 'P5-RENAMED' });
    expect(res.status).toBe(200);
    expect(res.body.jobNumber).toBe('P5-RENAMED');
    expect(res.body.startBid).toBe('12.00');
    expect(res.body.shippable).toBe(true);
  });
});
