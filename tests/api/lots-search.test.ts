// tests/api/lots-search.test.ts
// GET /api/lots ?search=... — case-insensitive ILIKE substring match
// against title OR description.
import { describe, it, expect, beforeEach } from 'vitest';
import { testDb, truncateAll } from '../helpers/test-db';
import { mintTestJwt } from '../helpers/test-jwt';
import { callHandler } from '../helpers/call-handler';
import { appUser, customer, job, lot } from '../../db/schema';
import handler from '../../api/lots/index';

const ADMIN = '00000000-0000-0000-0000-000000000001';

async function seed() {
  await testDb.insert(appUser).values({ id: ADMIN, role: 'admin', displayName: 'A' });
  const [c] = await testDb.insert(customer).values({ name: 'X' }).returning();
  const [j] = await testDb.insert(job).values({ customerId: c.id, jobNumber: 'X-001' }).returning();

  // Title-only match
  await testDb.insert(lot).values({
    jobId: j.id, lotNumber: 1, state: 'assigned', source: 'imported',
    intakeOperatorId: ADMIN, quantity: 1,
    title: 'Stanley FATMAX wrench', description: 'tool', price: '10.00',
  });
  // Description-only match
  await testDb.insert(lot).values({
    jobId: j.id, lotNumber: 2, state: 'assigned', source: 'imported',
    intakeOperatorId: ADMIN, quantity: 1,
    title: 'Mystery item', description: 'Possibly a Stanley product', price: '5.00',
  });
  // Both match
  await testDb.insert(lot).values({
    jobId: j.id, lotNumber: 3, state: 'assigned', source: 'imported',
    intakeOperatorId: ADMIN, quantity: 1,
    title: 'Stanley toolbox', description: 'Stanley brand', price: '20.00',
  });
  // No match
  await testDb.insert(lot).values({
    jobId: j.id, lotNumber: 4, state: 'assigned', source: 'imported',
    intakeOperatorId: ADMIN, quantity: 1,
    title: 'Bosch drill', description: 'corded electric', price: '50.00',
  });
  // NULL fields — must not crash the ILIKE
  await testDb.insert(lot).values({
    jobId: j.id, lotNumber: 5, state: 'assigned', source: 'imported',
    intakeOperatorId: ADMIN, quantity: 1,
  });
}

async function get(qs: string) {
  const token = await mintTestJwt({ userId: ADMIN, role: 'admin' });
  return callHandler<any>(handler, {
    method: 'GET', url: `/api/lots?${qs}`,
    headers: { Authorization: `Bearer ${token}` },
  });
}

beforeEach(async () => { await truncateAll(); await seed(); });

describe('GET /api/lots — search filter', () => {
  it('matches title OR description, case-insensitive', async () => {
    const res = await get('search=stanley');
    expect(res.status).toBe(200);
    const lotNumbers = res.body.lots.map((l: { lotNumber: number }) => l.lotNumber).sort();
    expect(lotNumbers).toEqual([1, 2, 3]);
  });

  it('uppercase query matches lowercase content', async () => {
    const res = await get('search=STANLEY');
    expect(res.status).toBe(200);
    const lotNumbers = res.body.lots.map((l: { lotNumber: number }) => l.lotNumber).sort();
    expect(lotNumbers).toEqual([1, 2, 3]);
  });

  it('substring match returns partial hits', async () => {
    const res = await get('search=tool');
    expect(res.status).toBe(200);
    // Lot 1 description='tool', Lot 3 title='Stanley toolbox' (contains "tool")
    const lotNumbers = res.body.lots.map((l: { lotNumber: number }) => l.lotNumber).sort();
    expect(lotNumbers).toEqual([1, 3]);
  });

  it('returns empty when no lots match', async () => {
    const res = await get('search=zzz_no_match_zzz');
    expect(res.status).toBe(200);
    expect(res.body.lots).toEqual([]);
    expect(res.body.total).toBe(0);
  });

  it('empty / whitespace search behaves as no filter', async () => {
    const res = await get('search=%20%20');
    expect(res.status).toBe(200);
    expect(res.body.lots.length).toBe(5);
  });

  it('absent search param behaves as no filter', async () => {
    const res = await get('');
    expect(res.status).toBe(200);
    expect(res.body.lots.length).toBe(5);
  });

  it('lots with NULL title and description are excluded from a non-empty search', async () => {
    const res = await get('search=anything');
    const lotNumbers = res.body.lots.map((l: { lotNumber: number }) => l.lotNumber);
    expect(lotNumbers).not.toContain(5);
  });

  it('combines with state filter (AND)', async () => {
    // All Stanley lots are assigned, so adding state=assigned changes nothing;
    // changing to state=sold should drop them all.
    const res = await get('search=stanley&state=sold');
    expect(res.status).toBe(200);
    expect(res.body.lots).toEqual([]);
  });
});
