// tests/api/lots-id-ai-reset.test.ts
// Single-lot Reset AI endpoint. Companion to the bulk 'reset-ai' action
// in /api/lots/bulk; thin per-lot path used by the lot detail Reset
// AI button.

import { describe, it, expect, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { testDb, truncateAll } from '../helpers/test-db';
import { mintTestJwt } from '../helpers/test-jwt';
import { callHandler } from '../helpers/call-handler';
import { appUser, customer, job, lot } from '../../db/schema';
import handler from '../../api/lots/[id]/ai-reset';

const ADMIN = '00000000-0000-0000-0000-000000000001';
const OFFICE = '00000000-0000-0000-0000-000000000002';
const WAREHOUSE = '00000000-0000-0000-0000-000000000003';

async function seedOneLot(opts: { status?: 'success' | 'partial' | 'failure' | null; lockMinAgo?: number | null } = {}) {
  await testDb.insert(appUser).values([
    { id: ADMIN, role: 'admin', displayName: 'A' },
    { id: OFFICE, role: 'office', displayName: 'O' },
    { id: WAREHOUSE, role: 'warehouse', displayName: 'W' },
  ]).onConflictDoNothing();
  const [c] = await testDb.insert(customer).values({ name: 'C' }).returning();
  const [j] = await testDb.insert(job).values({ customerId: c.id, jobNumber: 'J' }).returning();
  const [row] = await testDb.insert(lot).values({
    jobId: j.id, lotNumber: 1, state: 'assigned', source: 'imported',
    intakeOperatorId: ADMIN, quantity: 1,
    lastAiRunStatus: opts.status ?? null,
    lastAiRunError: opts.status === 'failure' ? 'boom' : null,
    aiProcessingStartedAt: opts.lockMinAgo != null
      ? new Date(Date.now() - opts.lockMinAgo * 60 * 1000)
      : null,
  }).returning();
  return row.id;
}

async function call(lotId: string, role: 'admin' | 'office' | 'warehouse' = 'admin', userId = ADMIN) {
  const token = await mintTestJwt({ userId, role });
  return callHandler<any>(handler, {
    method: 'POST',
    url: `/api/lots/${lotId}/ai-reset`,
    headers: { Authorization: `Bearer ${token}` },
  });
}

beforeEach(async () => { await truncateAll(); });

describe('POST /api/lots/:id/ai-reset', () => {
  it('clears status, error, and lock when status was failure', async () => {
    const lotId = await seedOneLot({ status: 'failure' });
    const res = await call(lotId);
    expect(res.status).toBe(200);
    expect(res.body.lastAiRunStatus).toBeNull();
    expect(res.body.lastAiRunError).toBeNull();
    expect(res.body.aiProcessingStartedAt).toBeNull();
  });

  it('also resets a successful lot (option B — any non-NULL status allowed)', async () => {
    const lotId = await seedOneLot({ status: 'success' });
    const res = await call(lotId);
    expect(res.status).toBe(200);
    expect(res.body.lastAiRunStatus).toBeNull();
  });

  it('also resets a partial lot', async () => {
    const lotId = await seedOneLot({ status: 'partial' });
    const res = await call(lotId);
    expect(res.body.lastAiRunStatus).toBeNull();
  });

  it('no-op-shaped success when status is already NULL', async () => {
    const lotId = await seedOneLot({ status: null });
    const res = await call(lotId);
    expect(res.status).toBe(200);
    expect(res.body.lastAiRunStatus).toBeNull();
  });

  it('clears a stuck (>5 min old) lock', async () => {
    const lotId = await seedOneLot({ status: 'failure', lockMinAgo: 6 });
    const res = await call(lotId);
    expect(res.status).toBe(200);
    expect(res.body.aiProcessingStartedAt).toBeNull();
  });

  it('refuses with 409 LOT_AI_IN_PROGRESS when the lock is fresh (<5 min)', async () => {
    const lotId = await seedOneLot({ status: null, lockMinAgo: 1 });
    const res = await call(lotId);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('LOT_AI_IN_PROGRESS');
    // Lock is preserved — we never race a live AI call
    const [row] = await testDb.select().from(lot).where(eq(lot.id, lotId));
    expect(row.aiProcessingStartedAt).not.toBeNull();
  });

  it('returns 404 for an unknown lot', async () => {
    await seedOneLot();
    const res = await call('00000000-0000-0000-0000-000000000099');
    expect(res.status).toBe(404);
  });

  it('warehouse role is rejected (admin + office only)', async () => {
    const lotId = await seedOneLot({ status: 'failure' });
    const res = await call(lotId, 'warehouse', WAREHOUSE);
    expect(res.status).toBe(403);
  });

  it('office role can reset', async () => {
    const lotId = await seedOneLot({ status: 'failure' });
    const res = await call(lotId, 'office', OFFICE);
    expect(res.status).toBe(200);
  });

  it('rejects non-POST methods', async () => {
    const lotId = await seedOneLot({ status: 'failure' });
    const token = await mintTestJwt({ userId: ADMIN, role: 'admin' });
    const res = await callHandler<any>(handler, {
      method: 'GET',
      url: `/api/lots/${lotId}/ai-reset`,
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(405);
  });
});
