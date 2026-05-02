import { describe, it, expect, beforeEach } from 'vitest';
import { testDb, truncateAll } from '../helpers/test-db';
import { mintTestJwt } from '../helpers/test-jwt';
import { callHandler } from '../helpers/call-handler';
import { appUser, customer, job, lot } from '../../db/schema';
import handler from '../../api/lots/export';

const ADMIN = '00000000-0000-0000-0000-000000000001';

async function seed() {
  await testDb.insert(appUser).values({ id: ADMIN, role: 'admin', displayName: 'A' });
  const [c] = await testDb.insert(customer).values({ name: 'Smith Estate' }).returning();
  const [j] = await testDb.insert(job).values({ customerId: c.id, jobNumber: 'X-001' }).returning();
  await testDb.insert(lot).values({
    jobId: j.id, lotNumber: 10, state: 'assigned', source: 'imported', title: 'Vase', price: '45.00', intakeOperatorId: ADMIN,
  });
}

async function call(query = '') {
  const token = await mintTestJwt({ userId: ADMIN, role: 'admin' });
  return callHandler(handler, {
    method: 'POST', url: `/api/lots/export${query}`,
    headers: { Authorization: `Bearer ${token}` },
  });
}

describe('POST /api/lots/export', () => {
  beforeEach(async () => { await truncateAll(); });

  it('returns CSV with the v1 column manifest', async () => {
    await seed();
    const res = await call();
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    const lines = res.text.trim().split('\n');
    expect(lines[0]).toContain('id,customer,job,lot_number,state,title');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('Smith Estate');
    expect(lines[1]).toContain('X-001');
    expect(lines[1]).toContain('Vase');
  });

  it('quotes values containing commas, newlines, and double-quotes', async () => {
    await testDb.insert(appUser).values({ id: ADMIN, role: 'admin', displayName: 'A' });
    const [c] = await testDb.insert(customer).values({ name: 'Acme, Inc.' }).returning();
    const [j] = await testDb.insert(job).values({ customerId: c.id, jobNumber: 'J' }).returning();
    await testDb.insert(lot).values({
      jobId: j.id, lotNumber: 10, state: 'assigned', source: 'imported', title: 'Has "quotes"', intakeOperatorId: ADMIN,
    });
    const res = await call();
    expect(res.text).toContain('"Acme, Inc."');
    expect(res.text).toContain('"Has ""quotes"""');
  });

  it('filters by jobId', async () => {
    await testDb.insert(appUser).values({ id: ADMIN, role: 'admin', displayName: 'A' });
    const [c] = await testDb.insert(customer).values({ name: 'C' }).returning();
    const [j1] = await testDb.insert(job).values({ customerId: c.id, jobNumber: 'J1' }).returning();
    const [j2] = await testDb.insert(job).values({ customerId: c.id, jobNumber: 'J2' }).returning();
    await testDb.insert(lot).values([
      { jobId: j1.id, lotNumber: 10, state: 'assigned', source: 'imported', title: 'A', intakeOperatorId: ADMIN },
      { jobId: j2.id, lotNumber: 10, state: 'assigned', source: 'imported', title: 'B', intakeOperatorId: ADMIN },
    ]);
    const res = await call(`?jobId=${j1.id}`);
    const lines = res.text.trim().split('\n');
    expect(lines).toHaveLength(2);  // header + 1 row
    expect(res.text).toContain('A');
    expect(res.text).not.toContain(',B,');  // commas around 'B' to avoid matching column 'B' substrings
  });

  it('filters by state[]', async () => {
    await testDb.insert(appUser).values({ id: ADMIN, role: 'admin', displayName: 'A' });
    const [c] = await testDb.insert(customer).values({ name: 'C' }).returning();
    const [j] = await testDb.insert(job).values({ customerId: c.id, jobNumber: 'J' }).returning();
    await testDb.insert(lot).values([
      { jobId: j.id, lotNumber: 10, state: 'assigned', source: 'imported', title: 'A', intakeOperatorId: ADMIN },
      { jobId: j.id, lotNumber: 11, state: 'sold',     source: 'imported', title: 'B', intakeOperatorId: ADMIN },
    ]);
    const res = await call('?state=sold');
    const lines = res.text.trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(res.text).toContain('sold');
  });

  it('warehouse cannot export (403)', async () => {
    await seed();
    const wh = '00000000-0000-0000-0000-000000000003';
    await testDb.insert(appUser).values({ id: wh, role: 'warehouse', displayName: 'W' });
    const token = await mintTestJwt({ userId: wh, role: 'warehouse' });
    const res = await callHandler(handler, {
      method: 'POST', url: '/api/lots/export',
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(403);
  });

  it('rejects GET (POST only)', async () => {
    const token = await mintTestJwt({ userId: ADMIN, role: 'admin' });
    const res = await callHandler(handler, {
      method: 'GET', url: '/api/lots/export',
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(405);
  });
});
