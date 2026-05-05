// tests/api/jobs-export-af360-start.test.ts
// Phase 5 Area 5 — Step 1 endpoint: validates pre-flight conditions,
// returns CSV inline + batch plan.

import { describe, it, expect, beforeEach } from 'vitest';
import { testDb, truncateAll } from '../helpers/test-db';
import { mintTestJwt } from '../helpers/test-jwt';
import { callHandler, type CallResult } from '../helpers/call-handler';
import { appUser, customer, job, lot } from '../../db/schema';
import startHandler from '../../api/jobs/[id]/export-af360/start';

const ADMIN = '00000000-0000-0000-0000-000000000001';
const OFFICE = '00000000-0000-0000-0000-000000000002';
const WAREHOUSE = '00000000-0000-0000-0000-000000000003';

async function seedFixture(opts: {
  sellerCode?: string | null;
  lotCount: number;
  startBid?: string;
  shippable?: boolean;
}): Promise<{ jobId: string; customerId: string }> {
  await testDb.insert(appUser).values([
    { id: ADMIN, role: 'admin', displayName: 'Admin' },
    { id: OFFICE, role: 'office', displayName: 'Office' },
    { id: WAREHOUSE, role: 'warehouse', displayName: 'Warehouse' },
  ]);
  // 'sellerCode' in opts distinguishes "explicitly omitted (use default)"
  // from "explicitly null (test the missing-code rejection)". Using `??`
  // would coalesce null back to the default and lose the null case.
  const sellerCodeValue = 'sellerCode' in opts ? opts.sellerCode : 'ACME001';
  const [c] = await testDb
    .insert(customer)
    .values({ name: 'Acme Auctions', sellerCode: sellerCodeValue })
    .returning();
  const [j] = await testDb
    .insert(job)
    .values({
      customerId: c.id,
      jobNumber: 'JOB-001',
      startBid: opts.startBid ?? '5.00',
      shippable: opts.shippable ?? false,
    })
    .returning();
  // Seed N assigned lots. source='imported' bypasses the must-have-photo
  // constraint trigger; export logic doesn't care about source.
  if (opts.lotCount > 0) {
    const rows = Array.from({ length: opts.lotCount }, (_, i) => ({
      jobId: j.id,
      lotNumber: i + 1,
      title: `Lot ${i + 1}`,
      description: `Description for lot ${i + 1}`,
      quantity: 1,
      state: 'assigned' as const,
      source: 'imported' as const,
      intakeOperatorId: ADMIN,
    }));
    await testDb.insert(lot).values(rows);
  }
  return { jobId: j.id, customerId: c.id };
}

async function callStart(
  id: string,
  role: 'admin' | 'office' | 'warehouse' = 'admin',
  userId = ADMIN,
): Promise<CallResult<any>> {
  const token = await mintTestJwt({ userId, role });
  return callHandler(startHandler, {
    method: 'POST',
    url: `/api/jobs/${id}/export-af360/start?id=${id}`,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: undefined,
  });
}

describe('POST /api/jobs/:id/export-af360/start', () => {
  beforeEach(async () => { await truncateAll(); });

  it('admin gets a successful response with csv + batch plan', async () => {
    const { jobId } = await seedFixture({ lotCount: 3 });
    const res = await callStart(jobId);
    expect(res.status).toBe(200);
    expect(res.body.csv).toContain('LotNumber,Title,Description,Quantity,SellerCode,StartBid,Shippable');
    expect(res.body.csv).toContain(',"Lot 1",');
    expect(res.body.totalLots).toBe(3);
    expect(res.body.totalBatches).toBe(1);
    expect(res.body.batches).toHaveLength(1);
    expect(res.body.batches[0].lotIds).toHaveLength(3);
    expect(res.body.csvFilename).toMatch(/^JobExport-acme-auctions-JOB-001-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(res.body.exportLabel).toMatch(/^JobExport-acme-auctions-JOB-001-\d{4}-\d{2}-\d{2}$/);
    expect(res.body.batchSize).toBe(100);
  });

  it('chunks 250 lots into 3 batches of 100, 100, 50', async () => {
    const { jobId } = await seedFixture({ lotCount: 250 });
    const res = await callStart(jobId);
    expect(res.status).toBe(200);
    expect(res.body.totalBatches).toBe(3);
    expect(res.body.batches[0].lotIds).toHaveLength(100);
    expect(res.body.batches[1].lotIds).toHaveLength(100);
    expect(res.body.batches[2].lotIds).toHaveLength(50);
  });

  it('rejects 400 SELLER_CODE_REQUIRED when customer has no seller_code', async () => {
    const { jobId } = await seedFixture({ sellerCode: null, lotCount: 3 });
    const res = await callStart(jobId);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('SELLER_CODE_REQUIRED');
  });

  it('rejects 400 NO_LOTS when job has no assigned lots', async () => {
    const { jobId } = await seedFixture({ lotCount: 0 });
    const res = await callStart(jobId);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('NO_LOTS');
  });

  it('rejects 404 NOT_FOUND for unknown job id', async () => {
    await seedFixture({ lotCount: 1 });
    const res = await callStart('00000000-0000-0000-0000-000000000099');
    expect(res.status).toBe(404);
  });

  it('admin allowed', async () => {
    const { jobId } = await seedFixture({ lotCount: 1 });
    const res = await callStart(jobId, 'admin', ADMIN);
    expect(res.status).toBe(200);
  });

  it('office allowed', async () => {
    const { jobId } = await seedFixture({ lotCount: 1 });
    const res = await callStart(jobId, 'office', OFFICE);
    expect(res.status).toBe(200);
  });

  it('warehouse forbidden', async () => {
    const { jobId } = await seedFixture({ lotCount: 1 });
    const res = await callStart(jobId, 'warehouse', WAREHOUSE);
    expect(res.status).toBe(403);
  });

  it('rejects unauthenticated', async () => {
    const { jobId } = await seedFixture({ lotCount: 1 });
    const res = await callHandler(startHandler, {
      method: 'POST',
      url: `/api/jobs/${jobId}/export-af360/start?id=${jobId}`,
      headers: { 'Content-Type': 'application/json' },
      body: undefined,
    });
    expect(res.status).toBe(401);
  });

  it('rejects wrong method', async () => {
    const { jobId } = await seedFixture({ lotCount: 1 });
    const token = await mintTestJwt({ userId: ADMIN, role: 'admin' });
    const res = await callHandler(startHandler, {
      method: 'GET',
      url: `/api/jobs/${jobId}/export-af360/start?id=${jobId}`,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: undefined,
    });
    expect(res.status).toBe(405);
  });

  it('uses Job.startBid in CSV row, not the schema default', async () => {
    const { jobId } = await seedFixture({ lotCount: 1, startBid: '12.00' });
    const res = await callStart(jobId);
    expect(res.status).toBe(200);
    expect(res.body.csv).toContain(',12.00,');
  });

  it('uses Job.shippable=true in CSV row when set', async () => {
    const { jobId } = await seedFixture({ lotCount: 1, shippable: true });
    const res = await callStart(jobId);
    expect(res.status).toBe(200);
    // Last cell in the row is Shippable
    const dataRow = res.body.csv.split('\r\n')[1];
    expect(dataRow.endsWith(',true')).toBe(true);
  });
});
