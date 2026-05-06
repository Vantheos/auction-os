// tests/api/lots-needs-info.test.ts
// Phase 6: GET /api/lots ?needsInfo=true filter.
import { describe, it, expect, beforeEach } from 'vitest';
import { testDb, truncateAll } from '../helpers/test-db';
import { mintTestJwt } from '../helpers/test-jwt';
import { callHandler } from '../helpers/call-handler';
import { appUser, customer, job, lot } from '../../db/schema';
import { sql } from 'drizzle-orm';
import handler from '../../api/lots/index';

const ADMIN = '00000000-0000-0000-0000-000000000001';

async function seed() {
  await testDb.insert(appUser).values({ id: ADMIN, role: 'admin', displayName: 'A' });
  const [c] = await testDb.insert(customer).values({ name: 'X' }).returning();
  const [j] = await testDb.insert(job).values({ customerId: c.id, jobNumber: 'X-001' }).returning();

  // Lot 1: full success — should NOT match needsInfo
  await testDb.insert(lot).values({
    jobId: j.id, lotNumber: 10, state: 'assigned', source: 'imported', intakeOperatorId: ADMIN, quantity: 1,
    title: 'T', description: 'D', price: '10.00', lastAiRunStatus: 'success',
  });
  // Lot 2: status=null, all fields null — match
  await testDb.insert(lot).values({
    jobId: j.id, lotNumber: 11, state: 'assigned', source: 'imported', intakeOperatorId: ADMIN, quantity: 1,
  });
  // Lot 3: status=partial, title null — match
  await testDb.insert(lot).values({
    jobId: j.id, lotNumber: 12, state: 'assigned', source: 'imported', intakeOperatorId: ADMIN, quantity: 1,
    description: 'D', price: '5.00', lastAiRunStatus: 'partial',
  });
  // Lot 4: status=success but user cleared title — match (field-null clause)
  await testDb.insert(lot).values({
    jobId: j.id, lotNumber: 13, state: 'assigned', source: 'imported', intakeOperatorId: ADMIN, quantity: 1,
    title: null, description: 'D', price: '5.00', lastAiRunStatus: 'success',
  });
  // Lot 5: status=failure — match
  await testDb.insert(lot).values({
    jobId: j.id, lotNumber: 14, state: 'assigned', source: 'imported', intakeOperatorId: ADMIN, quantity: 1,
    lastAiRunStatus: 'failure', lastAiRunError: 'boom',
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

describe('GET /api/lots ?needsInfo=true', () => {
  it('returns lots matching the comprehensive needs-info filter', async () => {
    const res = await get('needsInfo=true');
    expect(res.status).toBe(200);
    expect(res.body.lots).toHaveLength(4); // all except Lot 1
    const lotNumbers = res.body.lots.map((l: any) => l.lotNumber).sort();
    expect(lotNumbers).toEqual([11, 12, 13, 14]);
  });

  it('returns all lots when needsInfo not set', async () => {
    const res = await get('');
    expect(res.body.lots).toHaveLength(5);
  });

  it('combines with state filter (AND semantics)', async () => {
    // state='unassigned' requires NULL job_id + lot_number per state_tuple_consistent CHECK.
    // Plan-fix: original spec used 'sold' but that requires NON-NULL job_id/lot_number,
    // which would violate the CHECK constraint with the field nullouts performed here.
    await testDb.execute(sql`UPDATE lot SET state = 'unassigned', job_id = NULL, lot_number = NULL WHERE lot_number = 14`);
    const res = await get('needsInfo=true&state=assigned');
    const lotNumbers = res.body.lots.map((l: any) => l.lotNumber).sort();
    expect(lotNumbers).toEqual([11, 12, 13]);
  });
});
