// tests/api/ai-run.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { testDb, truncateAll } from '../helpers/test-db';
import { mintTestJwt } from '../helpers/test-jwt';
import { callHandler } from '../helpers/call-handler';
import { installAnthropicMock, SUCCESS_FIXTURE, mockAiRunResult } from '../helpers/mock-anthropic';
import { appUser, customer, job, lot, lotPhoto, systemSettings } from '../../db/schema';
import { sql } from 'drizzle-orm';

installAnthropicMock();
import { runAiForLot } from '../../src/lib/ai/anthropic';
import handler from '../../api/ai/run';

const ADMIN = '00000000-0000-0000-0000-000000000001';
const OFFICE = '00000000-0000-0000-0000-000000000002';
const WAREHOUSE = '00000000-0000-0000-0000-000000000003';

async function seed() {
  await testDb.insert(systemSettings).values({ id: 1 }).onConflictDoNothing();
  await testDb.insert(appUser).values([
    { id: ADMIN, role: 'admin', displayName: 'A' },
    { id: OFFICE, role: 'office', displayName: 'O' },
    { id: WAREHOUSE, role: 'warehouse', displayName: 'W' },
  ]);
  const [c] = await testDb.insert(customer).values({ name: 'X' }).returning();
  const [j] = await testDb.insert(job).values({ customerId: c.id, jobNumber: 'X-001' }).returning();
  const [l] = await testDb.insert(lot).values({
    jobId: j.id, lotNumber: 10, state: 'assigned', source: 'imported', intakeOperatorId: ADMIN, quantity: 1,
  }).returning();
  await testDb.insert(lotPhoto).values({
    lotId: l.id, storagePath: `lots/${l.id}/p.jpg`, displayOrder: 1, status: 'uploaded', capturedBy: ADMIN,
  });
  return { l };
}

async function call(lotId: string, role: 'admin' | 'office' | 'warehouse' = 'admin', userId = ADMIN) {
  const token = await mintTestJwt({ userId, role });
  return callHandler<any>(handler, {
    method: 'POST',
    url: '/api/ai/run',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: { lotId },
  });
}

beforeEach(async () => {
  await truncateAll();
  vi.mocked(runAiForLot).mockReset();
});

describe('POST /api/ai/run', () => {
  it('happy path: writes title/description/price + status=success + bumps counters', async () => {
    const { l } = await seed();
    vi.mocked(runAiForLot).mockResolvedValueOnce(SUCCESS_FIXTURE);
    const res = await call(l.id);
    expect(res.status).toBe(200);
    expect(res.body.lastAiRunStatus).toBe('success');
    expect(res.body.title).toBe('$120- 1x Stanley FATMAX Adjustable Wrench Set');
    expect(res.body.description).toContain('Heavy-duty adjustable wrench set');
    expect(res.body.price).toBe('120.00');
    expect(res.body.aiProcessingStartedAt).toBeNull();

    const [s] = await testDb.select().from(systemSettings);
    expect(s.aiRunCountLifetime).toBe(1);
    expect(s.aiCostMtdCents).toBeGreaterThan(0);
  });

  it('partial: AI returns null price → title falls back, status=partial', async () => {
    const { l } = await seed();
    vi.mocked(runAiForLot).mockResolvedValueOnce(mockAiRunResult({
      brand: 'Stanley',
      brief_description: 'Wrench Set',
      description_body: 'Used wrench set in case.',
      price: null,
    }));
    const res = await call(l.id);
    expect(res.status).toBe(200);
    expect(res.body.lastAiRunStatus).toBe('partial');
    expect(res.body.title).toMatch(/^\$\$\$- 1x Stanley/);
    expect(res.body.price).toBeNull();
    expect(res.body.lastAiRunError).toContain('title');
    expect(res.body.lastAiRunError).toContain('price');
  });

  it('rejects 422 LOT_NOT_ELIGIBLE when status already set', async () => {
    const { l } = await seed();
    await testDb.execute(sql`UPDATE lot SET last_ai_run_status = 'success' WHERE id = ${l.id}`);
    const res = await call(l.id);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('LOT_NOT_ELIGIBLE');
  });

  it('rejects 422 LOT_NOT_ELIGIBLE when state is sold', async () => {
    const { l } = await seed();
    await testDb.execute(sql`UPDATE lot SET state = 'sold' WHERE id = ${l.id}`);
    const res = await call(l.id);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('LOT_NOT_ELIGIBLE');
  });

  it('rejects 423 LOT_AI_IN_PROGRESS when processing lock is fresh', async () => {
    const { l } = await seed();
    await testDb.execute(sql`UPDATE lot SET ai_processing_started_at = NOW() WHERE id = ${l.id}`);
    const res = await call(l.id);
    expect(res.status).toBe(423);
    expect(res.body.error.code).toBe('LOT_AI_IN_PROGRESS');
  });

  it('proceeds when processing lock is stale (>5 min)', async () => {
    const { l } = await seed();
    await testDb.execute(sql`UPDATE lot SET ai_processing_started_at = NOW() - INTERVAL '10 minutes' WHERE id = ${l.id}`);
    vi.mocked(runAiForLot).mockResolvedValueOnce(SUCCESS_FIXTURE);
    const res = await call(l.id);
    expect(res.status).toBe(200);
  });

  it('rejects 403 for warehouse role', async () => {
    const { l } = await seed();
    const res = await call(l.id, 'warehouse', WAREHOUSE);
    expect(res.status).toBe(403);
  });

  it('failure path: AI throws → status=failure, lock cleared, counter increments', async () => {
    const { l } = await seed();
    vi.mocked(runAiForLot).mockRejectedValueOnce(new Error('Anthropic API exploded'));
    const res = await call(l.id);
    expect(res.status).toBe(200);
    expect(res.body.lastAiRunStatus).toBe('failure');
    expect(res.body.lastAiRunError).toContain('Anthropic API exploded');
    expect(res.body.aiProcessingStartedAt).toBeNull();
    const [s] = await testDb.select().from(systemSettings);
    expect(s.aiRunCountLifetime).toBe(1);
  });

  it('rejects 404 for unknown lot', async () => {
    await seed();
    const res = await call('00000000-0000-0000-0000-00000000dead');
    expect(res.status).toBe(404);
  });

  it('rejects 400 on invalid body', async () => {
    await seed();
    const token = await mintTestJwt({ userId: ADMIN, role: 'admin' });
    const res = await callHandler<any>(handler, {
      method: 'POST', url: '/api/ai/run',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: { wrongField: 'x' },
    });
    expect(res.status).toBe(400);
  });
});
