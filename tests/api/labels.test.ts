import { describe, it, expect, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { testDb, truncateAll } from '../helpers/test-db';
import { mintTestJwt } from '../helpers/test-jwt';
import { callHandler, type CallResult } from '../helpers/call-handler';
import { appUser, customer, job, lot } from '../../db/schema';
import handler from '../../api/labels/render';

const ADMIN = '00000000-0000-0000-0000-000000000001';

async function seed() {
  await testDb.insert(appUser).values({ id: ADMIN, role: 'admin', displayName: 'A' });
  const [c] = await testDb.insert(customer).values({ name: 'Smith Estate' }).returning();
  const [j] = await testDb.insert(job).values({ customerId: c.id, jobNumber: '2026-04-Smith-001' }).returning();
  const [l] = await testDb.insert(lot).values({
    jobId: j.id, lotNumber: 13, state: 'assigned', source: 'imported', intakeOperatorId: ADMIN,
  }).returning();
  return l.id;
}

async function call(body: unknown): Promise<CallResult<any>> {
  const token = await mintTestJwt({ userId: ADMIN, role: 'admin' });
  return callHandler(handler, {
    method: 'POST', url: '/api/labels/render',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body,
  });
}

describe('POST /api/labels/render', () => {
  beforeEach(async () => { await truncateAll(); });

  it('returns ZPL for a known lot', async () => {
    const lotId = await seed();
    const res = await call({ lotId });
    expect(res.status).toBe(200);
    expect(res.body.zpl).toContain('^XA');
    expect(res.body.zpl).toContain('Lot 13');
    expect(res.body.zpl).toContain('Smith Estate');
  });

  it('clears label_reprint_needed when set on the rendered lot', async () => {
    const lotId = await seed();
    await testDb.update(lot).set({ labelReprintNeeded: true }).where(eq(lot.id, lotId));
    const res = await call({ lotId });
    expect(res.status).toBe(200);
    const [after] = await testDb.select().from(lot).where(eq(lot.id, lotId));
    expect(after.labelReprintNeeded).toBe(false);
  });

  it('leaves label_reprint_needed false when already false (no spurious update)', async () => {
    const lotId = await seed();
    const [before] = await testDb.select({ updatedAt: lot.updatedAt }).from(lot).where(eq(lot.id, lotId));
    const res = await call({ lotId });
    expect(res.status).toBe(200);
    const [after] = await testDb.select({ updatedAt: lot.updatedAt, flag: lot.labelReprintNeeded }).from(lot).where(eq(lot.id, lotId));
    expect(after.flag).toBe(false);
    // updated_at should be unchanged because we skipped the UPDATE.
    expect(after.updatedAt.getTime()).toBe(before.updatedAt.getTime());
  });

  it('404 on unknown lot', async () => {
    await seed();
    const res = await call({ lotId: '00000000-0000-0000-0000-000000000099' });
    expect(res.status).toBe(404);
  });

  it('422 NOT_LABELLABLE for lot without auction assignment (unassigned)', async () => {
    const lotId = await seed();
    await testDb.update(lot).set({ state: 'unassigned', jobId: null, lotNumber: null }).where(eq(lot.id, lotId));
    const res = await call({ lotId });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('NOT_LABELLABLE');
  });

  it('rejects GET (POST only)', async () => {
    await seed();
    const token = await mintTestJwt({ userId: ADMIN, role: 'admin' });
    const res = await callHandler(handler, {
      method: 'GET', url: '/api/labels/render',
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(405);
  });

  it('400 on missing lotId', async () => {
    await seed();
    const res = await call({});
    expect(res.status).toBe(400);
  });
});
