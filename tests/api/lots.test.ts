// tests/api/lots.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { testDb, truncateAll } from '../helpers/test-db';
import { mintTestJwt } from '../helpers/test-jwt';
import { callHandler, type CallResult } from '../helpers/call-handler';
import { appUser, customer, job } from '../../db/schema';
import handler from '../../api/lots/index';

const ADMIN = '00000000-0000-0000-0000-000000000001';
const OFFICE = '00000000-0000-0000-0000-000000000002';
const WAREHOUSE = '00000000-0000-0000-0000-000000000003';

async function seed() {
  await testDb.insert(appUser).values([
    { id: ADMIN, role: 'admin', displayName: 'Admin' },
    { id: OFFICE, role: 'office', displayName: 'Office' },
    { id: WAREHOUSE, role: 'warehouse', displayName: 'Wh' },
  ]);
  const [c] = await testDb.insert(customer).values({ name: 'Smith Estate' }).returning();
  const [j] = await testDb.insert(job).values({ customerId: c.id, jobNumber: '2026-04-Smith-001' }).returning();
  return { customerId: c.id, jobId: j.id };
}

async function call(method: string, body: unknown, role: 'admin' | 'office' | 'warehouse', userId: string, query = ''): Promise<CallResult<any>> {
  const token = await mintTestJwt({ userId, role });
  // POST /api/lots now requires firstPhoto per the lot-has-photo trigger
  // (migration 0008). Auto-attach unless the caller already provided one
  // (or explicitly passed an empty {} to test rejection paths).
  const finalBody =
    method === 'POST' && body && typeof body === 'object' && 'jobId' in (body as object) && !('firstPhoto' in (body as object))
      ? { ...(body as object), firstPhoto: { displayOrder: 1 } }
      : body;
  return callHandler(handler, {
    method,
    url: `/api/lots${query}`,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: finalBody ?? undefined,
  });
}

describe('POST /api/lots', () => {
  beforeEach(async () => { await truncateAll(); });

  it('warehouse can create a lot in assigned state', async () => {
    const { jobId } = await seed();
    const res = await call('POST', { jobId }, 'warehouse', WAREHOUSE);
    expect(res.status).toBe(201);
    expect(res.body.state).toBe('assigned');
    expect(res.body.jobId).toBe(jobId);
    expect(res.body.lotNumber).toBe(10);          // §5.2: starts at 10 per job
    expect(res.body.intakeOperatorId).toBe(WAREHOUSE);
  });

  it('POST response includes joined customerName + jobNumber', async () => {
    const { jobId } = await seed();
    const res = await call('POST', { jobId }, 'admin', ADMIN);
    expect(res.status).toBe(201);
    expect(res.body.customerName).toBe('Smith Estate');
    expect(res.body.jobNumber).toBe('2026-04-Smith-001');
    expect(res.body.customerId).toBeDefined();
  });

  it('increments lot_number per job (10, 11, 12, ...)', async () => {
    const { jobId } = await seed();
    const a = await call('POST', { jobId }, 'admin', ADMIN);
    const b = await call('POST', { jobId }, 'admin', ADMIN);
    expect(a.body.lotNumber).toBe(10);
    expect(b.body.lotNumber).toBe(11);
  });

  it('rejects missing jobId', async () => {
    const res = await call('POST', {}, 'admin', ADMIN);
    expect(res.status).toBe(400);
  });

  it('requires auth', async () => {
    const res = await callHandler(handler, { method: 'POST', url: '/api/lots', headers: { 'Content-Type': 'application/json' }, body: {} });
    expect(res.status).toBe(401);
  });
});

describe('GET /api/lots', () => {
  beforeEach(async () => { await truncateAll(); });

  it('lists lots and returns total', async () => {
    const { jobId } = await seed();
    await call('POST', { jobId }, 'admin', ADMIN);
    await call('POST', { jobId }, 'admin', ADMIN);
    const res = await call('GET', null, 'admin', ADMIN);
    expect(res.status).toBe(200);
    expect(res.body.lots).toHaveLength(2);
    expect(res.body.total).toBe(2);
  });

  it('filters by jobId', async () => {
    const { customerId, jobId } = await seed();
    const [j2] = await testDb.insert(job).values({ customerId, jobNumber: 'X-002' }).returning();
    await call('POST', { jobId }, 'admin', ADMIN);
    await call('POST', { jobId: j2.id }, 'admin', ADMIN);
    const res = await call('GET', null, 'admin', ADMIN, `?jobId=${jobId}`);
    expect(res.body.lots).toHaveLength(1);
    expect(res.body.lots[0].jobId).toBe(jobId);
  });

  it('filters by state[]', async () => {
    const { jobId } = await seed();
    await call('POST', { jobId }, 'admin', ADMIN);   // assigned
    const res = await call('GET', null, 'admin', ADMIN, '?state=assigned');
    expect(res.body.lots).toHaveLength(1);
  });

  it('paginates with limit + offset', async () => {
    const { jobId } = await seed();
    for (let i = 0; i < 5; i++) await call('POST', { jobId }, 'admin', ADMIN);
    const page1 = await call('GET', null, 'admin', ADMIN, '?limit=2&offset=0');
    expect(page1.body.lots).toHaveLength(2);
    expect(page1.body.total).toBe(5);
  });
});

describe('GET /api/lots — filter & pagination edge cases', () => {
  beforeEach(async () => { await truncateAll(); });

  it('coerces NaN limit to default (50)', async () => {
    const { jobId } = await seed();
    await call('POST', { jobId }, 'admin', ADMIN);
    const res = await call('GET', null, 'admin', ADMIN, '?limit=abc');
    expect(res.status).toBe(200);
    expect(res.body.lots).toHaveLength(1);
  });

  it('coerces negative offset to 0', async () => {
    const { jobId } = await seed();
    await call('POST', { jobId }, 'admin', ADMIN);
    const res = await call('GET', null, 'admin', ADMIN, '?offset=-5');
    expect(res.status).toBe(200);
    expect(res.body.lots).toHaveLength(1);
  });

  it('filters by aiStatus including not-run', async () => {
    const { jobId } = await seed();
    await call('POST', { jobId }, 'admin', ADMIN);  // lastAiRunStatus is NULL
    const res = await call('GET', null, 'admin', ADMIN, '?aiStatus=not-run');
    expect(res.status).toBe(200);
    expect(res.body.lots).toHaveLength(1);
  });

  it('filters by dateFrom (inclusive)', async () => {
    const { jobId } = await seed();
    await call('POST', { jobId }, 'admin', ADMIN);
    const future = new Date(Date.now() + 60_000).toISOString();
    const past = new Date(Date.now() - 60_000).toISOString();
    const a = await call('GET', null, 'admin', ADMIN, `?dateFrom=${encodeURIComponent(future)}`);
    expect(a.body.lots).toHaveLength(0);
    const b = await call('GET', null, 'admin', ADMIN, `?dateFrom=${encodeURIComponent(past)}`);
    expect(b.body.lots).toHaveLength(1);
  });
});
