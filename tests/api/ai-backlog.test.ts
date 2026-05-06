// tests/api/ai-backlog.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { testDb, truncateAll } from '../helpers/test-db';
import { mintTestJwt } from '../helpers/test-jwt';
import { callHandler } from '../helpers/call-handler';
import { installAnthropicMock, SUCCESS_FIXTURE } from '../helpers/mock-anthropic';
import { appUser, customer, job, lot, lotPhoto, systemSettings } from '../../db/schema';
import { sql } from 'drizzle-orm';

installAnthropicMock();
import { runAiForLot } from '../../src/lib/ai/anthropic';
import handler from '../../api/ai/backlog';

const ADMIN = '00000000-0000-0000-0000-000000000001';

async function seedBacklog(count: number) {
  await testDb.insert(systemSettings).values({ id: 1 }).onConflictDoNothing();
  await testDb.insert(appUser).values({ id: ADMIN, role: 'admin', displayName: 'A' }).onConflictDoNothing();
  const [c] = await testDb.insert(customer).values({ name: 'Bulk' }).returning();
  const [j] = await testDb.insert(job).values({ customerId: c.id, jobNumber: 'B-001' }).returning();
  for (let i = 0; i < count; i++) {
    const [l] = await testDb.insert(lot).values({
      jobId: j.id, lotNumber: 10 + i, state: 'assigned', source: 'imported', intakeOperatorId: ADMIN, quantity: 1,
    }).returning();
    await testDb.insert(lotPhoto).values({
      lotId: l.id, storagePath: `lots/${l.id}/p.jpg`, displayOrder: 1, status: 'uploaded', capturedBy: ADMIN,
    });
  }
}

async function callCron() {
  const secret = process.env.CRON_SECRET;
  return callHandler<any>(handler, {
    method: 'POST', url: '/api/ai/backlog?source=cron',
    headers: { Authorization: `Bearer ${secret}` },
  });
}

async function callUser() {
  const token = await mintTestJwt({ userId: ADMIN, role: 'admin' });
  return callHandler<any>(handler, {
    method: 'POST', url: '/api/ai/backlog',
    headers: { Authorization: `Bearer ${token}` },
  });
}

beforeEach(async () => {
  await truncateAll();
  vi.mocked(runAiForLot).mockReset();
});

describe('POST /api/ai/backlog (cron source)', () => {
  it('skipped: disabled when aiScheduleEnabled=false', async () => {
    await testDb.insert(systemSettings).values({ id: 1, aiScheduleEnabled: false });
    const res = await callCron();
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ skipped: true, reason: 'disabled' });
  });

  it('skipped: too_soon when within intervalHours of last run', async () => {
    await testDb.insert(systemSettings).values({
      id: 1, aiScheduleEnabled: true, aiScheduleIntervalHours: 24,
    });
    await testDb.execute(sql`UPDATE system_settings SET ai_last_run_at = NOW() WHERE id = 1`);
    const res = await callCron();
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ skipped: true, reason: 'too_soon' });
  });

  it('processes eligible backlog up to cap', async () => {
    await seedBacklog(25);
    vi.mocked(runAiForLot).mockResolvedValue(SUCCESS_FIXTURE);
    const res = await callCron();
    expect(res.status).toBe(200);
    expect(res.body.processed).toBe(20); // cap
    expect(res.body.remaining).toBe(5);
    expect(res.body.errors).toBe(0);
    // ai_last_run_at NOT updated because remaining > 0 (drain-eagerly)
    const [s] = await testDb.select().from(systemSettings);
    expect(s.aiLastRunAt).toBeNull();
  });

  it('updates ai_last_run_at when backlog drained', async () => {
    await seedBacklog(5);
    vi.mocked(runAiForLot).mockResolvedValue(SUCCESS_FIXTURE);
    const res = await callCron();
    expect(res.body.processed).toBe(5);
    expect(res.body.remaining).toBe(0);
    const [s] = await testDb.select().from(systemSettings);
    expect(s.aiLastRunAt).not.toBeNull();
  });

  it('rejects 401 without CRON_SECRET', async () => {
    await seedBacklog(1);
    const res = await callHandler<any>(handler, {
      method: 'POST', url: '/api/ai/backlog?source=cron', headers: {},
    });
    expect(res.status).toBe(401);
  });

  it('skipped: in_progress when system lock held', async () => {
    await seedBacklog(5);
    await testDb.execute(sql`UPDATE system_settings SET ai_run_lock_until = NOW() + INTERVAL '4 minutes' WHERE id = 1`);
    const res = await callCron();
    expect(res.body).toMatchObject({ skipped: true, reason: 'in_progress' });
  });

  it('proceeds when system lock is stale', async () => {
    await seedBacklog(2);
    await testDb.execute(sql`UPDATE system_settings SET ai_run_lock_until = NOW() - INTERVAL '1 minute' WHERE id = 1`);
    vi.mocked(runAiForLot).mockResolvedValue(SUCCESS_FIXTURE);
    const res = await callCron();
    expect(res.body.processed).toBe(2);
  });

  it('releases lock after processing', async () => {
    await seedBacklog(3);
    vi.mocked(runAiForLot).mockResolvedValue(SUCCESS_FIXTURE);
    await callCron();
    const [s] = await testDb.select().from(systemSettings);
    expect(s.aiRunLockUntil).toBeNull();
  });

  it('counts errors but continues processing', async () => {
    await seedBacklog(3);
    vi.mocked(runAiForLot)
      .mockResolvedValueOnce(SUCCESS_FIXTURE)
      .mockRejectedValueOnce(new Error('AI exploded'))
      .mockResolvedValueOnce(SUCCESS_FIXTURE);
    const res = await callCron();
    expect(res.body.processed).toBe(2);
    expect(res.body.errors).toBe(1);
    expect(res.body.remaining).toBe(0);
  });
});

describe('POST /api/ai/backlog (Run Now)', () => {
  it('bypasses schedule gate when called by user', async () => {
    await seedBacklog(2);
    // Set last_run_at recent (would block cron)
    await testDb.execute(sql`UPDATE system_settings SET ai_last_run_at = NOW() WHERE id = 1`);
    vi.mocked(runAiForLot).mockResolvedValue(SUCCESS_FIXTURE);
    const res = await callUser();
    expect(res.status).toBe(200);
    expect(res.body.processed).toBe(2);
  });

  it('rejects 401 without auth', async () => {
    await seedBacklog(1);
    const res = await callHandler<any>(handler, {
      method: 'POST', url: '/api/ai/backlog', headers: {},
    });
    expect(res.status).toBe(401);
  });

  it('rejects 403 for warehouse', async () => {
    await seedBacklog(1);
    await testDb.insert(appUser).values({ id: '00000000-0000-0000-0000-000000000099', role: 'warehouse', displayName: 'W' });
    const token = await mintTestJwt({ userId: '00000000-0000-0000-0000-000000000099', role: 'warehouse' });
    const res = await callHandler<any>(handler, {
      method: 'POST', url: '/api/ai/backlog',
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(403);
  });

  it('Run Now also advances ai_last_run_at when remaining=0', async () => {
    await seedBacklog(2);
    vi.mocked(runAiForLot).mockResolvedValue(SUCCESS_FIXTURE);
    await callUser();
    const [s] = await testDb.select().from(systemSettings);
    expect(s.aiLastRunAt).not.toBeNull();
  });
});
