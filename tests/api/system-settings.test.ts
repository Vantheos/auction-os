// tests/api/system-settings.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { testDb, truncateAll } from '../helpers/test-db';
import { mintTestJwt } from '../helpers/test-jwt';
import { callHandler, type CallResult } from '../helpers/call-handler';
import { appUser, customer, job, lot, systemSettings } from '../../db/schema';
import handler from '../../api/system-settings';

const ADMIN = '00000000-0000-0000-0000-000000000001';
const OFFICE = '00000000-0000-0000-0000-000000000002';

async function seedFixtures() {
  await testDb.insert(systemSettings).values({ id: 1 }).onConflictDoNothing();
  await testDb.insert(appUser).values([
    { id: ADMIN, role: 'admin', displayName: 'A' },
    { id: OFFICE, role: 'office', displayName: 'O' },
  ]);
}

async function call(method: string, body: unknown, role: 'admin' | 'office' = 'admin', userId = ADMIN): Promise<CallResult<any>> {
  const token = await mintTestJwt({ userId, role });
  return callHandler(handler, {
    method, url: '/api/system-settings',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body ?? undefined,
  });
}

describe('GET /api/system-settings', () => {
  beforeEach(async () => { await truncateAll(); await seedFixtures(); });

  it('returns the singleton row', async () => {
    const res = await call('GET', null);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(1);
  });

  it('any authenticated role can read', async () => {
    const res = await call('GET', null, 'office', OFFICE);
    expect(res.status).toBe(200);
  });

  it('aiPendingLotCount is zero with no lots', async () => {
    const res = await call('GET', null);
    expect(res.status).toBe(200);
    expect(res.body.aiPendingLotCount).toBe(0);
  });

  it('aiPendingLotCount counts lots awaiting AI (status=null, state in assigned/unassigned)', async () => {
    const [c] = await testDb.insert(customer).values({ name: 'X' }).returning();
    const [j] = await testDb.insert(job).values({ customerId: c.id, jobNumber: 'J-1' }).returning();
    // 2 awaiting AI (the count) + 2 excluded (succeeded / sold-state).
    // state_tuple_consistent: unassigned/not-sellable require jobId+lotNumber NULL;
    // assigned/sold/picked-up require both set.
    await testDb.insert(lot).values([
      { jobId: null,  lotNumber: null, state: 'unassigned', source: 'imported', intakeOperatorId: ADMIN, quantity: 1 },
      { jobId: j.id,  lotNumber: 2,    state: 'assigned',   source: 'imported', intakeOperatorId: ADMIN, quantity: 1 },
      { jobId: j.id,  lotNumber: 3,    state: 'assigned',   source: 'imported', intakeOperatorId: ADMIN, quantity: 1, lastAiRunStatus: 'success' },
      { jobId: j.id,  lotNumber: 4,    state: 'sold',       source: 'imported', intakeOperatorId: ADMIN, quantity: 1 },
    ]);
    const res = await call('GET', null);
    expect(res.status).toBe(200);
    expect(res.body.aiPendingLotCount).toBe(2);
  });
});

describe('PATCH /api/system-settings', () => {
  beforeEach(async () => { await truncateAll(); await seedFixtures(); });

  it('admin updates labelPrinterHelperUrl', async () => {
    const res = await call('PATCH', { labelPrinterHelperUrl: 'http://localhost:9100' });
    expect(res.status).toBe(200);
    expect(res.body.labelPrinterHelperUrl).toBe('http://localhost:9100');
  });

  it('admin can clear labelPrinterHelperUrl with null', async () => {
    await call('PATCH', { labelPrinterHelperUrl: 'http://localhost:9100' });
    const res = await call('PATCH', { labelPrinterHelperUrl: null });
    expect(res.status).toBe(200);
    expect(res.body.labelPrinterHelperUrl).toBeNull();
  });

  it('office cannot patch (403)', async () => {
    const res = await call('PATCH', { labelPrinterHelperUrl: 'x' }, 'office', OFFICE);
    expect(res.status).toBe(403);
  });

  it('rejects unknown field (strict schema)', async () => {
    const res = await call('PATCH', { somethingUnsupported: 'value' });
    expect(res.status).toBe(400);
  });

  it('rejects non-URL string', async () => {
    const res = await call('PATCH', { labelPrinterHelperUrl: 'not-a-url' });
    expect(res.status).toBe(400);
  });

  it('accepts AI schedule fields (Phase 4 Area 3)', async () => {
    const res = await call('PATCH', {
      aiScheduleEnabled: false,
      aiScheduleIntervalHours: 8,
      aiScheduleTimeOfDay: '09:00',
    });
    expect(res.status).toBe(200);
    expect(res.body.aiScheduleEnabled).toBe(false);
    expect(res.body.aiScheduleIntervalHours).toBe(8);
    // Postgres TIME serializes as HH:MM:SS regardless of input format
    expect(res.body.aiScheduleTimeOfDay).toMatch(/^09:00(:00)?$/);
  });

  it('PATCH response includes aiPendingLotCount (matches GET shape)', async () => {
    // Without this, the client cache replaces a populated GET response
    // with a PATCH response that has no count, and the badge renders
    // "undefined lots pending AI". GET and PATCH must return the same
    // shape so setQueryData on the success path is safe.
    const [c] = await testDb.insert(customer).values({ name: 'Y' }).returning();
    const [j] = await testDb.insert(job).values({ customerId: c.id, jobNumber: 'J-2' }).returning();
    await testDb.insert(lot).values([
      { jobId: null,  lotNumber: null, state: 'unassigned', source: 'imported', intakeOperatorId: ADMIN, quantity: 1 },
      { jobId: j.id,  lotNumber: 1,    state: 'assigned',   source: 'imported', intakeOperatorId: ADMIN, quantity: 1 },
    ]);
    const res = await call('PATCH', { aiScheduleIntervalHours: 12 });
    expect(res.status).toBe(200);
    expect(res.body.aiPendingLotCount).toBe(2);
  });

  it('rejects malformed aiScheduleTimeOfDay', async () => {
    const res = await call('PATCH', { aiScheduleTimeOfDay: 'not-a-time' });
    expect(res.status).toBe(400);
  });

  it('rejects non-positive aiScheduleIntervalHours', async () => {
    const res = await call('PATCH', { aiScheduleIntervalHours: 0 });
    expect(res.status).toBe(400);
  });
});
