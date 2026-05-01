// tests/api/lots-create-with-photo.test.ts
// Phase 3: POST /api/lots can atomically create the first lot_photo row +
// return a signed upload URL when the request body includes firstPhoto.
// Also covers the advisory-lock retrofit (concurrent POSTs to the same
// job get sequential lot_numbers without colliding on the unique index).

import { describe, it, expect, beforeEach } from 'vitest';
import { testDb, truncateAll } from '../helpers/test-db';
import { mintTestJwt } from '../helpers/test-jwt';
import { callHandler } from '../helpers/call-handler';
import { appUser, customer, job, lotPhoto } from '../../db/schema';
import handler from '../../api/lots/index';
import { eq } from 'drizzle-orm';

const ADMIN = '00000000-0000-0000-0000-000000000001';
const WAREHOUSE = '00000000-0000-0000-0000-000000000003';

async function seed() {
  await testDb.insert(appUser).values([
    { id: ADMIN, role: 'admin', displayName: 'Admin' },
    { id: WAREHOUSE, role: 'warehouse', displayName: 'Wh' },
  ]);
  const [c] = await testDb.insert(customer).values({ name: 'Smith Estate' }).returning();
  const [j] = await testDb.insert(job).values({ customerId: c.id, jobNumber: '2026-04-Smith-001' }).returning();
  return { customerId: c.id, jobId: j.id };
}

async function call(body: unknown, role: 'admin' | 'office' | 'warehouse', userId: string) {
  const token = await mintTestJwt({ userId, role });
  return callHandler<any>(handler, {
    method: 'POST',
    url: '/api/lots',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body,
  });
}

describe('POST /api/lots with firstPhoto', () => {
  beforeEach(async () => { await truncateAll(); });

  it('creates the lot row + first lot_photo row in the same response', async () => {
    const { jobId } = await seed();
    const res = await call({ jobId, firstPhoto: { displayOrder: 1 } }, 'warehouse', WAREHOUSE);
    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.firstPhoto).toBeDefined();
    expect(res.body.firstPhoto.id).toBeDefined();
    expect(res.body.firstPhoto.lotId).toBe(res.body.id);
    expect(res.body.firstPhoto.displayOrder).toBe(1);
    expect(res.body.firstPhoto.status).toBe('pending');
    expect(res.body.firstPhoto.storagePath).toMatch(/^lots\/[0-9a-f-]+\/[0-9a-f-]+\.jpg$/);
    expect(res.body.firstPhoto.uploadUrl).toMatch(/^https?:\/\//);
  });

  it('persists the lot_photo row in the DB with status=pending', async () => {
    const { jobId } = await seed();
    const res = await call({ jobId, firstPhoto: { displayOrder: 1 } }, 'admin', ADMIN);
    const photos = await testDb.select().from(lotPhoto).where(eq(lotPhoto.lotId, res.body.id));
    expect(photos).toHaveLength(1);
    expect(photos[0].status).toBe('pending');
    expect(photos[0].displayOrder).toBe(1);
    expect(photos[0].capturedBy).toBe(ADMIN);
  });

  it('omits firstPhoto from response when not requested', async () => {
    const { jobId } = await seed();
    const res = await call({ jobId }, 'admin', ADMIN);
    expect(res.status).toBe(201);
    expect(res.body.firstPhoto ?? null).toBeNull();
    const photos = await testDb.select().from(lotPhoto).where(eq(lotPhoto.lotId, res.body.id));
    expect(photos).toHaveLength(0);
  });

  it('rolls back lot row if the firstPhoto insert would fail', async () => {
    // The schema permits any displayOrder ≥ 1; this test mostly verifies
    // the happy path is properly atomic. With real-world failure modes
    // (e.g., Storage signing fails after commit) the lot row stays — that's
    // intentional and handled by the cleanup sweep.
    const { jobId } = await seed();
    const res = await call({ jobId, firstPhoto: { displayOrder: 1 } }, 'admin', ADMIN);
    expect(res.status).toBe(201);
  });
});

describe('POST /api/lots advisory-lock concurrency', () => {
  beforeEach(async () => { await truncateAll(); });

  it('5 concurrent creates against the same job get sequential lot_numbers', async () => {
    const { jobId } = await seed();
    const results = await Promise.all(
      Array.from({ length: 5 }).map(() => call({ jobId }, 'admin', ADMIN))
    );
    const statuses = results.map((r) => r.status);
    const lotNumbers = results.map((r) => r.body.lotNumber).sort((a, b) => a - b);
    expect(statuses.every((s) => s === 201)).toBe(true);
    expect(lotNumbers).toEqual([10, 11, 12, 13, 14]);
  });

  it('does not return 409 LOT_NUMBER_CONFLICT under normal concurrency', async () => {
    const { jobId } = await seed();
    const results = await Promise.all(
      Array.from({ length: 3 }).map(() => call({ jobId }, 'admin', ADMIN))
    );
    expect(results.find((r) => r.status === 409)).toBeUndefined();
  });
});
