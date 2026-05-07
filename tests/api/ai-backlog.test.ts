// tests/api/ai-backlog.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { testDb, truncateAll } from '../helpers/test-db';
import { mintTestJwt } from '../helpers/test-jwt';
import { callHandler } from '../helpers/call-handler';
import { installAnthropicMock, SUCCESS_FIXTURE } from '../helpers/mock-anthropic';
import { appUser, auditLog, customer, job, lot, lotPhoto, systemSettings } from '../../db/schema';
import { and, desc, eq, sql } from 'drizzle-orm';

installAnthropicMock();
// Stub Supabase storage signing — the test DB has lot_photo rows but no
// actual files in Supabase Storage, so real signing would 404 per call
// (~300ms × 20 lots = blows the test timeout). Returning an empty Map
// makes the handler's photoUrls array empty, which is fine because the
// AI call itself is mocked too. The handler imports from '../_lib/storage.js'
// — vitest resolves the .js form to the same module ID.
vi.mock('../../api/_lib/storage.js', () => ({
  bulkSignReadUrls: vi.fn().mockResolvedValue(new Map<string, string>()),
  signUploadUrl: vi.fn(),
  signReadUrl: vi.fn(),
  downloadPhotoTransformed: vi.fn(),
  removeObjects: vi.fn(),
  listLotObjects: vi.fn(),
  STORAGE_BUCKET: 'lot-photos',
}));
import { runAiForLot } from '../../src/lib/ai/anthropic';
import handler, { CAP_PER_INVOCATION } from '../../api/ai/backlog';

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
    // truncateAll() restores the singleton row; UPDATE rather than INSERT.
    await testDb.update(systemSettings).set({ aiScheduleEnabled: false }).where(eq(systemSettings.id, 1));
    const res = await callCron();
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ skipped: true, reason: 'disabled' });
  });

  it('skipped: too_soon when ai_last_run_at is at or after the most recent scheduled grid time', async () => {
    // Default settings: timeOfDay 23:00, interval 24h. Grid is "23:00 daily."
    // ai_last_run_at = NOW() is always >= the most recent grid tick, so the
    // gate throttles. No drain in progress and no scheduled time passed.
    await testDb.update(systemSettings).set({
      aiScheduleEnabled: true, aiScheduleIntervalHours: 24,
    }).where(eq(systemSettings.id, 1));
    await testDb.execute(sql`UPDATE system_settings SET ai_last_run_at = NOW() WHERE id = 1`);
    const res = await callCron();
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ skipped: true, reason: 'too_soon' });
  });

  it('drain_in_progress overrides schedule gate (cron keeps draining across heartbeats)', async () => {
    // Set ai_last_run_at recent (would normally throttle), but mark drain
    // as in progress — the heartbeat must continue regardless of the grid.
    await seedBacklog(2);
    await testDb.execute(sql`
      UPDATE system_settings
         SET ai_last_run_at = NOW(),
             ai_drain_in_progress = true
       WHERE id = 1
    `);
    vi.mocked(runAiForLot).mockResolvedValue(SUCCESS_FIXTURE);
    const res = await callCron();
    expect(res.body.processed).toBe(2);
    expect(res.body.remaining).toBe(0);
    // After the drain finishes the flag clears.
    const [s] = await testDb.select().from(systemSettings);
    expect(s.aiDrainInProgress).toBe(false);
  });

  it('drain spans multiple cron heartbeats (sequential calls reach remaining=0)', async () => {
    // Seed CAP+5 lots so the first call leaves remaining > 0. Verify the
    // drain-in-progress flag persists, and a second cron call drains the rest.
    const overflow = 5;
    await seedBacklog(CAP_PER_INVOCATION + overflow);
    vi.mocked(runAiForLot).mockResolvedValue(SUCCESS_FIXTURE);

    const res1 = await callCron();
    expect(res1.body.processed).toBe(CAP_PER_INVOCATION);
    expect(res1.body.remaining).toBe(overflow);
    const [after1] = await testDb.select().from(systemSettings);
    expect(after1.aiDrainInProgress).toBe(true);
    expect(after1.aiLastRunAt).toBeNull();

    const res2 = await callCron();
    expect(res2.body.processed).toBe(overflow);
    expect(res2.body.remaining).toBe(0);
    const [after2] = await testDb.select().from(systemSettings);
    expect(after2.aiDrainInProgress).toBe(false);
    expect(after2.aiLastRunAt).not.toBeNull();
  }, 30_000);

  it('no-op tick (no eligible lots) bumps ai_last_run_at and clears drain_in_progress', async () => {
    // Replaces the old `processed > 0` guard behavior. Even when nothing
    // is processed, the gate's idle bookkeeping has to advance so the
    // operator's schedule actually throttles instead of polling every 15 min.
    const res = await callCron();
    expect(res.body.processed).toBe(0);
    expect(res.body.remaining).toBe(0);
    const [s] = await testDb.select().from(systemSettings);
    expect(s.aiLastRunAt).not.toBeNull();
    expect(s.aiDrainInProgress).toBe(false);
  });

  it('drain starts when scheduled grid time has passed since last completed drain', async () => {
    // 1-hour interval anchored at midnight: grid hits every hour on the hour.
    // ai_last_run_at = 2h ago means a grid tick has passed since then.
    await testDb.update(systemSettings).set({
      aiScheduleEnabled: true, aiScheduleIntervalHours: 1, aiScheduleTimeOfDay: '00:00:00',
    }).where(eq(systemSettings.id, 1));
    await testDb.execute(sql`UPDATE system_settings SET ai_last_run_at = NOW() - INTERVAL '2 hours' WHERE id = 1`);
    await seedBacklog(2);
    vi.mocked(runAiForLot).mockResolvedValue(SUCCESS_FIXTURE);
    const res = await callCron();
    expect(res.body.processed).toBe(2);
    expect(res.body.remaining).toBe(0);
  });

  it('skips lots whose title + description + price are all already populated (operator-completed)', async () => {
    // Lot 1: fully filled by operator before AI ran. Should be skipped.
    // Lot 2: missing description. Should be picked up.
    // Lot 3: empty-string title. Should be picked up (empty = missing).
    // Lot 4: price=NULL only. Should be picked up.
    await testDb.insert(systemSettings).values({ id: 1 }).onConflictDoNothing();
    await testDb.insert(appUser).values({ id: ADMIN, role: 'admin', displayName: 'A' }).onConflictDoNothing();
    const [c] = await testDb.insert(customer).values({ name: 'Skip' }).returning();
    const [j] = await testDb.insert(job).values({ customerId: c.id, jobNumber: 'SKIP-001' }).returning();
    await testDb.insert(lot).values([
      { jobId: j.id, lotNumber: 1, state: 'assigned', source: 'imported', intakeOperatorId: ADMIN, quantity: 1,
        title: 'T', description: 'D', price: '5.00' },
      { jobId: j.id, lotNumber: 2, state: 'assigned', source: 'imported', intakeOperatorId: ADMIN, quantity: 1,
        title: 'T', description: null, price: '5.00' },
      { jobId: j.id, lotNumber: 3, state: 'assigned', source: 'imported', intakeOperatorId: ADMIN, quantity: 1,
        title: '', description: 'D', price: '5.00' },
      { jobId: j.id, lotNumber: 4, state: 'assigned', source: 'imported', intakeOperatorId: ADMIN, quantity: 1,
        title: 'T', description: 'D', price: null },
    ]);
    vi.mocked(runAiForLot).mockResolvedValue(SUCCESS_FIXTURE);
    const res = await callCron();
    expect(res.status).toBe(200);
    expect(res.body.processed).toBe(3);
    expect(res.body.remaining).toBe(0);
  });

  it('processes eligible backlog up to cap', async () => {
    // Seed CAP+5 lots so there's a meaningful "remaining" no matter what
    // the cap value is set to — the assertion derives both numbers from
    // the actual constant so a cap change doesn't silently weaken the test.
    const overflow = 5;
    await seedBacklog(CAP_PER_INVOCATION + overflow);
    vi.mocked(runAiForLot).mockResolvedValue(SUCCESS_FIXTURE);
    const res = await callCron();
    expect(res.status).toBe(200);
    expect(res.body.processed).toBe(CAP_PER_INVOCATION);
    expect(res.body.remaining).toBe(overflow);
    expect(res.body.errors).toBe(0);
    // ai_last_run_at NOT updated because remaining > 0 (drain-eagerly).
    // drain_in_progress stays true so the next heartbeat continues.
    const [s] = await testDb.select().from(systemSettings);
    expect(s.aiLastRunAt).toBeNull();
    expect(s.aiDrainInProgress).toBe(true);
    // CAP+5 seeded × ~5 DB round-trips each on a max=1 postgres pool runs
    // through one serialized connection; default 5s is too tight even with
    // concurrency=3 in the handler. 30s leaves comfortable headroom.
  }, 30_000);

  it('updates ai_last_run_at and clears drain_in_progress when backlog drained', async () => {
    await seedBacklog(5);
    vi.mocked(runAiForLot).mockResolvedValue(SUCCESS_FIXTURE);
    const res = await callCron();
    expect(res.body.processed).toBe(5);
    expect(res.body.remaining).toBe(0);
    const [s] = await testDb.select().from(systemSettings);
    expect(s.aiLastRunAt).not.toBeNull();
    expect(s.aiDrainInProgress).toBe(false);
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

  it('Run Now is skipped when system lock is held (concurrent-run safeguard)', async () => {
    // Run Now bypasses the schedule gate but must still respect the
    // single-runner system lock. With ai_run_lock_until in the future,
    // the operator's click should bounce with `skipped: in_progress`
    // rather than racing the in-flight cron drain.
    await seedBacklog(2);
    await testDb.execute(sql`UPDATE system_settings SET ai_run_lock_until = NOW() + INTERVAL '4 minutes' WHERE id = 1`);
    const res = await callUser();
    expect(res.body).toMatchObject({ skipped: true, reason: 'in_progress' });
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
    expect(s.aiDrainInProgress).toBe(false);
  });

  it('audit attribution: cron writes NULL changed_by, Run Now writes the operator id', async () => {
    // The finalizeLotRun UPDATE produces the lot's "last AI run status" audit
    // row. Cron has no operator → changed_by is NULL. Run Now's requireAuth
    // surfaces a userId → asActor sets the JWT GUC → audit trigger captures
    // the operator. The per-lot claim UPDATE (sets ai_processing_started_at)
    // is a separate, earlier audit row written outside asActor and always has
    // changed_by = NULL; we filter to the finalize row by looking for one
    // that carries last_ai_run_status in changed_fields.
    await seedBacklog(1);
    vi.mocked(runAiForLot).mockResolvedValue(SUCCESS_FIXTURE);

    const res1 = await callCron();
    expect(res1.body.processed).toBe(1);
    const [cronLot] = await testDb.select().from(lot);
    const cronAuditRows = await testDb.select().from(auditLog)
      .where(and(eq(auditLog.tableName, 'lot'), eq(auditLog.recordId, cronLot.id)))
      .orderBy(desc(auditLog.changedAt));
    // Finalize row = the one whose new.last_ai_run_status is the run outcome.
    // The earlier per-lot claim only sets ai_processing_started_at, leaving
    // last_ai_run_status NULL on both sides.
    const cronFinalize = cronAuditRows.find((r) => {
      const cf = r.changedFields as { new?: { last_ai_run_status?: string | null } } | null;
      return cf?.new?.last_ai_run_status === 'success';
    });
    expect(cronFinalize).toBeDefined();
    expect(cronFinalize!.changedBy).toBeNull();

    // Seed a second eligible lot and process it via Run Now.
    const [j] = await testDb.select().from(job);
    const [l2] = await testDb.insert(lot).values({
      jobId: j.id, lotNumber: 99, state: 'assigned', source: 'imported',
      intakeOperatorId: ADMIN, quantity: 1,
    }).returning();
    await testDb.insert(lotPhoto).values({
      lotId: l2.id, storagePath: `lots/${l2.id}/p.jpg`, displayOrder: 1, status: 'uploaded', capturedBy: ADMIN,
    });

    const res2 = await callUser();
    expect(res2.body.processed).toBe(1);
    const runNowRows = await testDb.select().from(auditLog)
      .where(and(eq(auditLog.tableName, 'lot'), eq(auditLog.recordId, l2.id)))
      .orderBy(desc(auditLog.changedAt));
    const runNowFinalize = runNowRows.find((r) => {
      const cf = r.changedFields as { new?: { last_ai_run_status?: string | null } } | null;
      return cf?.new?.last_ai_run_status === 'success';
    });
    expect(runNowFinalize).toBeDefined();
    expect(runNowFinalize!.changedBy).toBe(ADMIN);
  });

  it('Run Now leaves drain_in_progress=true when work remains so cron continues it', async () => {
    // CAP+overflow: Run Now processes the cap, leaves overflow pending.
    // The flag has to stay true so the next cron heartbeat (which would
    // otherwise throttle on the schedule grid) continues the drain.
    await seedBacklog(CAP_PER_INVOCATION + 3);
    vi.mocked(runAiForLot).mockResolvedValue(SUCCESS_FIXTURE);
    const res = await callUser();
    expect(res.body.processed).toBe(CAP_PER_INVOCATION);
    expect(res.body.remaining).toBe(3);
    const [s] = await testDb.select().from(systemSettings);
    expect(s.aiDrainInProgress).toBe(true);
  }, 30_000);
});
