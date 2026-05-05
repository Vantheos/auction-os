// tests/api/customer-seller-code.test.ts
// Phase 5 Area 2: validates the new sellerCode field on POST + PATCH.
// POST: required (1-50 chars, non-empty).
// PATCH: optional (1-50 chars when present); allows other-field edits
//        without forcing sellerCode change in the same save.

import { describe, it, expect, beforeEach } from 'vitest';
import { testDb, truncateAll } from '../helpers/test-db';
import { mintTestJwt } from '../helpers/test-jwt';
import { callHandler, type CallResult } from '../helpers/call-handler';
import { appUser } from '../../db/schema';
import indexHandler from '../../api/customers/index';
import idHandler from '../../api/customers/[id]';

const ADMIN = '00000000-0000-0000-0000-000000000001';
const OFFICE = '00000000-0000-0000-0000-000000000002';

async function seedUsers() {
  await testDb.insert(appUser).values([
    { id: ADMIN, role: 'admin', displayName: 'Admin' },
    { id: OFFICE, role: 'office', displayName: 'Office' },
  ]);
}

async function callCreate(body: unknown, userId = ADMIN, role: 'admin' | 'office' = 'admin'): Promise<CallResult<any>> {
  const token = await mintTestJwt({ userId, role });
  return callHandler(indexHandler, {
    method: 'POST',
    url: '/api/customers',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body ?? undefined,
  });
}

async function callPatch(id: string, body: unknown, userId = ADMIN, role: 'admin' | 'office' = 'admin'): Promise<CallResult<any>> {
  const token = await mintTestJwt({ userId, role });
  return callHandler(idHandler, {
    method: 'PATCH',
    url: `/api/customers/${id}?id=${id}`,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body ?? undefined,
  });
}

describe('POST /api/customers — sellerCode validation', () => {
  beforeEach(async () => {
    await truncateAll();
    await seedUsers();
  });

  it('accepts a valid sellerCode', async () => {
    const res = await callCreate({ name: 'Acme', sellerCode: 'SMTH001' });
    expect(res.status).toBe(201);
    expect(res.body.sellerCode).toBe('SMTH001');
  });

  it('rejects POST without sellerCode', async () => {
    const res = await callCreate({ name: 'Acme' });
    expect(res.status).toBe(400);
  });

  it('rejects empty sellerCode', async () => {
    const res = await callCreate({ name: 'Acme', sellerCode: '' });
    expect(res.status).toBe(400);
  });

  it('rejects sellerCode > 50 chars', async () => {
    const res = await callCreate({ name: 'Acme', sellerCode: 'X'.repeat(51) });
    expect(res.status).toBe(400);
  });

  it('accepts a 50-char sellerCode', async () => {
    const res = await callCreate({ name: 'Acme', sellerCode: 'X'.repeat(50) });
    expect(res.status).toBe(201);
    expect(res.body.sellerCode).toHaveLength(50);
  });
});

describe('PATCH /api/customers/:id — sellerCode validation', () => {
  beforeEach(async () => {
    await truncateAll();
    await seedUsers();
  });

  it('updates sellerCode on existing customer', async () => {
    const created = (await callCreate({ name: 'Acme', sellerCode: 'OLD' })).body;
    const res = await callPatch(created.id, { sellerCode: 'NEW001' });
    expect(res.status).toBe(200);
    expect(res.body.sellerCode).toBe('NEW001');
  });

  it('allows name-only update without sellerCode in body', async () => {
    const created = (await callCreate({ name: 'Acme', sellerCode: 'ACME001' })).body;
    const res = await callPatch(created.id, { name: 'Acme Renamed' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Acme Renamed');
    expect(res.body.sellerCode).toBe('ACME001');
  });

  it('rejects empty sellerCode', async () => {
    const created = (await callCreate({ name: 'Acme', sellerCode: 'ACME001' })).body;
    const res = await callPatch(created.id, { sellerCode: '' });
    expect(res.status).toBe(400);
  });

  it('rejects sellerCode > 50 chars', async () => {
    const created = (await callCreate({ name: 'Acme', sellerCode: 'ACME001' })).body;
    const res = await callPatch(created.id, { sellerCode: 'X'.repeat(51) });
    expect(res.status).toBe(400);
  });

  it('office role can update sellerCode', async () => {
    const created = (await callCreate({ name: 'Acme', sellerCode: 'ACME001' })).body;
    const res = await callPatch(created.id, { sellerCode: 'OFFICE1' }, OFFICE, 'office');
    expect(res.status).toBe(200);
    expect(res.body.sellerCode).toBe('OFFICE1');
  });
});
