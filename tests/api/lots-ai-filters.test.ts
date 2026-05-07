// tests/api/lots-ai-filters.test.ts
// REQ-1 (2026-05-06): GET /api/lots ?awaitingAi=true and ?needsReview=true
// (split from the legacy single ?needsInfo=true filter). The legacy param
// still works as a compatibility union.
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

  // Lot 10: full success — neither chip
  await testDb.insert(lot).values({
    jobId: j.id, lotNumber: 10, state: 'assigned', source: 'imported', intakeOperatorId: ADMIN, quantity: 1,
    title: 'T', description: 'D', price: '10.00', lastAiRunStatus: 'success',
  });
  // Lot 11: status=null, eligible state — Awaiting AI
  await testDb.insert(lot).values({
    jobId: j.id, lotNumber: 11, state: 'assigned', source: 'imported', intakeOperatorId: ADMIN, quantity: 1,
  });
  // Lot 12: status=partial — Needs review
  await testDb.insert(lot).values({
    jobId: j.id, lotNumber: 12, state: 'assigned', source: 'imported', intakeOperatorId: ADMIN, quantity: 1,
    description: 'D', price: '5.00', lastAiRunStatus: 'partial',
  });
  // Lot 13: status=success but operator cleared title — Needs review (post-success empty field)
  await testDb.insert(lot).values({
    jobId: j.id, lotNumber: 13, state: 'assigned', source: 'imported', intakeOperatorId: ADMIN, quantity: 1,
    title: null, description: 'D', price: '5.00', lastAiRunStatus: 'success',
  });
  // Lot 14: status=failure — Needs review
  await testDb.insert(lot).values({
    jobId: j.id, lotNumber: 14, state: 'assigned', source: 'imported', intakeOperatorId: ADMIN, quantity: 1,
    lastAiRunStatus: 'failure', lastAiRunError: 'boom',
  });
  // Lot 15: status=success but operator cleared price — Needs review
  await testDb.insert(lot).values({
    jobId: j.id, lotNumber: 15, state: 'assigned', source: 'imported', intakeOperatorId: ADMIN, quantity: 1,
    title: 'T', description: 'D', price: null, lastAiRunStatus: 'success',
  });
  // Lot 16: state=sold (not eligible) with status=success and empty fields — neither chip
  // (sold lots are conceptually done; empty fields don't drag them back into queues)
  await testDb.insert(lot).values({
    jobId: j.id, lotNumber: 16, state: 'sold', source: 'imported', intakeOperatorId: ADMIN, quantity: 1,
    title: null, description: null, price: null, lastAiRunStatus: 'success',
  });
  // Lot 17: status=null but operator filled all fields at catalog time —
  // neither chip (AI won't run on it; not failed; nothing to review).
  // Lives in the unfiltered Inventory list only.
  await testDb.insert(lot).values({
    jobId: j.id, lotNumber: 17, state: 'assigned', source: 'imported', intakeOperatorId: ADMIN, quantity: 1,
    title: 'Operator title', description: 'Operator description', price: '12.50',
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

describe('GET /api/lots — Awaiting AI / Needs review filters (REQ-1)', () => {
  it('?awaitingAi=true returns only lots AI will pick up (status NULL + at least one field empty)', async () => {
    const res = await get('awaitingAi=true');
    expect(res.status).toBe(200);
    const lotNumbers = res.body.lots.map((l: any) => l.lotNumber).sort();
    // Lot 11 (all fields null, status null) is in. Lot 17 (status null but
    // all fields populated by operator at catalog time) is NOT — AI won't
    // pick it up via the eligibility skip in /api/ai/backlog.
    expect(lotNumbers).toEqual([11]);
  });

  it('?awaitingAi=true excludes status-NULL lots whose title/description/price are all populated', async () => {
    const res = await get('awaitingAi=true');
    const lotNumbers = res.body.lots.map((l: any) => l.lotNumber);
    expect(lotNumbers).not.toContain(17);
  });

  it('operator-completed status-NULL lots appear in NEITHER chip', async () => {
    const awaiting = await get('awaitingAi=true');
    const review = await get('needsReview=true');
    expect(awaiting.body.lots.map((l: any) => l.lotNumber)).not.toContain(17);
    expect(review.body.lots.map((l: any) => l.lotNumber)).not.toContain(17);
  });

  it('?needsReview=true returns lots with partial/failure status OR success-with-empty-fields', async () => {
    const res = await get('needsReview=true');
    expect(res.status).toBe(200);
    const lotNumbers = res.body.lots.map((l: any) => l.lotNumber).sort();
    expect(lotNumbers).toEqual([12, 13, 14, 15]);
  });

  it('?needsReview=true does NOT include status=NULL lots (those belong to Awaiting AI)', async () => {
    const res = await get('needsReview=true');
    const lotNumbers = res.body.lots.map((l: any) => l.lotNumber);
    expect(lotNumbers).not.toContain(11);
  });

  it('both flags active = union of the two queues', async () => {
    const res = await get('awaitingAi=true&needsReview=true');
    const lotNumbers = res.body.lots.map((l: any) => l.lotNumber).sort();
    expect(lotNumbers).toEqual([11, 12, 13, 14, 15]);
  });

  it('returns all lots when neither flag is set', async () => {
    const res = await get('');
    expect(res.body.lots).toHaveLength(8);
  });

  it('combines with state filter (AND semantics)', async () => {
    const res = await get('needsReview=true&state=assigned');
    const lotNumbers = res.body.lots.map((l: any) => l.lotNumber).sort();
    expect(lotNumbers).toEqual([12, 13, 14, 15]);
  });

  it('legacy ?needsInfo=true still works (union of both new filters)', async () => {
    const res = await get('needsInfo=true');
    const lotNumbers = res.body.lots.map((l: any) => l.lotNumber).sort();
    expect(lotNumbers).toEqual([11, 12, 13, 14, 15]);
  });

  it('Needs review excludes lots whose state is sold even if fields are empty', async () => {
    const res = await get('needsReview=true');
    const lotNumbers = res.body.lots.map((l: any) => l.lotNumber);
    expect(lotNumbers).not.toContain(16);
  });
});
