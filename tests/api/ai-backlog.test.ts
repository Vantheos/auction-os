// tests/api/ai-backlog.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { testDb, truncateAll } from '../helpers/test-db';
import { mintTestJwt } from '../helpers/test-jwt';
import { callHandler } from '../helpers/call-handler';
import { installAnthropicMock, SUCCESS_FIXTURE } from '../helpers/mock-anthropic';
import { appUser, customer, job, lot, lotPhoto, systemSettings } from '../../db/schema';
import { eq, sql } from 'drizzle-orm';

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

  it('skipped: too_soon when within intervalHours of last run', async () => {
    await testDb.update(systemSettings).set({
      aiScheduleEnabled: true, aiScheduleIntervalHours: 24,
    }).where(eq(systemSettings.id, 1));
    await testDb.execute(sql`UPDATE system_settings SET ai_last_run_at = NOW() WHERE id = 1`);
    const res = await callCron();
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ skipped: true, reason: 'too_soon' });
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
    // ai_last_run_at NOT updated because remaining > 0 (drain-eagerly)
    const [s] = await testDb.select().from(systemSettings);
    expect(s.aiLastRunAt).toBeNull();
    // CAP+5 seeded × ~5 DB round-trips each on a max=1 postgres pool runs
    // through one serialized connection; default 5s is too tight even with
    // concurrency=3 in the handler. 30s leaves comfortable headroom.
  }, 30_000);

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
