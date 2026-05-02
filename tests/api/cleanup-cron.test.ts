// tests/api/cleanup-cron.test.ts
// /api/cron/cleanup-orphan-lots — sweeps assigned/unassigned lots that have
// zero lot_photo rows AND were created > 30 minutes ago. Auth-gated by
// CRON_SECRET bearer token.

import { describe, it, expect, beforeEach } from 'vitest';
import { testDb, truncateAll } from '../helpers/test-db';
import { callHandler } from '../helpers/call-handler';
import { appUser, customer, job, lot, lotPhoto } from '../../db/schema';
import handler from '../../api/cron/cleanup-orphan-lots';
import { sql } from 'drizzle-orm';

const ADMIN = '00000000-0000-0000-0000-000000000001';

async function seedOrphans() {
  await testDb.insert(appUser).values({ id: ADMIN, role: 'admin', displayName: 'A' });
  const [c] = await testDb.insert(customer).values({ name: 'X' }).returning();
  const [j] = await testDb.insert(job).values({ customerId: c.id, jobNumber: 'X-001' }).returning();

  // Old orphan: assigned, no photos, created > 30 min ago — should be reaped
  // Tagged 'imported' to bypass the cataloging-source create gate; the
  // sweep doesn't care about source, only photo presence + age + state.
  const [oldOrphan] = await testDb.insert(lot).values({
    jobId: j.id, lotNumber: 10, state: 'assigned', source: 'imported', intakeOperatorId: ADMIN,
  }).returning();
  await testDb.execute(sql`UPDATE lot SET created_at = NOW() - INTERVAL '1 hour' WHERE id = ${oldOrphan.id}`);

  // Recent orphan: assigned, no photos, created < 30 min ago — should NOT be reaped
  const [recentOrphan] = await testDb.insert(lot).values({
    jobId: j.id, lotNumber: 11, state: 'assigned', source: 'imported', intakeOperatorId: ADMIN,
  }).returning();

  // Real lot: assigned, has photos, old — should NOT be reaped
  const [realLot] = await testDb.insert(lot).values({
    jobId: j.id, lotNumber: 12, state: 'assigned', source: 'imported', intakeOperatorId: ADMIN,
  }).returning();
  await testDb.execute(sql`UPDATE lot SET created_at = NOW() - INTERVAL '2 hours' WHERE id = ${realLot.id}`);
  await testDb.insert(lotPhoto).values({
    lotId: realLot.id, storagePath: `lots/${realLot.id}/p.jpg`, displayOrder: 1, status: 'uploaded', capturedBy: ADMIN,
  });

  // Sold lot, old, zero photos — should NOT be reaped (state filter)
  const [soldLot] = await testDb.insert(lot).values({
    jobId: j.id, lotNumber: 13, state: 'sold', source: 'imported', intakeOperatorId: ADMIN,
  }).returning();
  await testDb.execute(sql`UPDATE lot SET created_at = NOW() - INTERVAL '2 hours' WHERE id = ${soldLot.id}`);

  return { oldOrphan, recentOrphan, realLot, soldLot };
}

async function callCron(authHeader?: string) {
  return callHandler<any>(handler, {
    method: 'POST',
    url: '/api/cron/cleanup-orphan-lots',
    headers: authHeader ? { Authorization: authHeader } : {},
  });
}

describe('POST /api/cron/cleanup-orphan-lots', () => {
  beforeEach(async () => { await truncateAll(); });

  it('reaps only true orphans (assigned/unassigned, zero photos, > 30 min old)', async () => {
    const seeded = await seedOrphans();
    const secret = process.env.CRON_SECRET;
    expect(secret).toBeDefined();
    const res = await callCron(`Bearer ${secret}`);
    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(1);
    expect(res.body.errors).toBe(0);

    // Verify the right rows survived
    const survivors = await testDb.select({ id: lot.id }).from(lot);
    const ids = survivors.map((s) => s.id);
    expect(ids).not.toContain(seeded.oldOrphan.id);
    expect(ids).toContain(seeded.recentOrphan.id);
    expect(ids).toContain(seeded.realLot.id);
    expect(ids).toContain(seeded.soldLot.id);
  });

  it('rejects 401 without Authorization header', async () => {
    await seedOrphans();
    const res = await callCron();
    expect(res.status).toBe(401);
  });

  it('rejects 401 with wrong CRON_SECRET', async () => {
    await seedOrphans();
    const res = await callCron('Bearer wrong-secret');
    expect(res.status).toBe(401);
  });

  it('returns deleted=0 when there are no orphans', async () => {
    await testDb.insert(appUser).values({ id: ADMIN, role: 'admin', displayName: 'A' });
    const [c] = await testDb.insert(customer).values({ name: 'X' }).returning();
    const [j] = await testDb.insert(job).values({ customerId: c.id, jobNumber: 'X-001' }).returning();
    const [l] = await testDb.insert(lot).values({
      jobId: j.id, lotNumber: 10, state: 'assigned', source: 'imported', intakeOperatorId: ADMIN,
    }).returning();
    await testDb.insert(lotPhoto).values({
      lotId: l.id, storagePath: `lots/${l.id}/p.jpg`, displayOrder: 1, status: 'uploaded', capturedBy: ADMIN,
    });

    const res = await callCron(`Bearer ${process.env.CRON_SECRET}`);
    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(0);
  });
});
