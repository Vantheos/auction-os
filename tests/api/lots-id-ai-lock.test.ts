// tests/api/lots-id-ai-lock.test.ts
// Phase 6: PATCH lock-check extension to /api/lots/[id].
import { describe, it, expect, beforeEach } from 'vitest';
import { testDb, truncateAll } from '../helpers/test-db';
import { mintTestJwt } from '../helpers/test-jwt';
import { callHandler } from '../helpers/call-handler';
import { appUser, customer, job, lot, lotPhoto, systemSettings } from '../../db/schema';
import { sql } from 'drizzle-orm';
import handler from '../../api/lots/[id]';

const ADMIN = '00000000-0000-0000-0000-000000000001';

async function seed() {
  await testDb.insert(systemSettings).values({ id: 1 }).onConflictDoNothing();
  await testDb.insert(appUser).values({ id: ADMIN, role: 'admin', displayName: 'A' });
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

async function patch(lotId: string, body: unknown) {
  const token = await mintTestJwt({ userId: ADMIN, role: 'admin' });
  return callHandler<any>(handler, {
    method: 'PATCH',
    url: `/api/lots/${lotId}?id=${lotId}`,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body,
  });
}

beforeEach(async () => { await truncateAll(); });

describe('PATCH /api/lots/[id] AI lock check', () => {
  it('rejects 423 when ai_processing_started_at is fresh', async () => {
    const { l } = await seed();
    await testDb.execute(sql`UPDATE lot SET ai_processing_started_at = NOW() WHERE id = ${l.id}`);
    const res = await patch(l.id, { title: 'Manual edit' });
    expect(res.status).toBe(423);
    expect(res.body.error.code).toBe('LOT_AI_IN_PROGRESS');
  });

  it('allows state change even when AI in flight', async () => {
    const { l } = await seed();
    await testDb.execute(sql`UPDATE lot SET ai_processing_started_at = NOW() WHERE id = ${l.id}`);
    const res = await patch(l.id, { state: 'not-sellable' });
    expect(res.status).toBe(200);
  });

  it('allows field edits when ai_processing_started_at is stale (>5 min)', async () => {
    const { l } = await seed();
    await testDb.execute(sql`UPDATE lot SET ai_processing_started_at = NOW() - INTERVAL '10 minutes' WHERE id = ${l.id}`);
    const res = await patch(l.id, { title: 'Manual edit' });
    expect(res.status).toBe(200);
  });

  it('allows field edits when no AI lock present', async () => {
    const { l } = await seed();
    const res = await patch(l.id, { title: 'Manual edit' });
    expect(res.status).toBe(200);
  });
});
