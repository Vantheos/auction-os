import { describe, it, expect, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { testDb, truncateAll } from '../helpers/test-db';
import { mintTestJwt } from '../helpers/test-jwt';
import { callHandler, type CallResult } from '../helpers/call-handler';
import { appUser, customer, job, lot } from '../../db/schema';
import indexHandler from '../../api/customers/index';
import idHandler from '../../api/customers/[id]';

const ADMIN = '00000000-0000-0000-0000-000000000001';
const OFFICE = '00000000-0000-0000-0000-000000000002';
const WAREHOUSE = '00000000-0000-0000-0000-000000000003';

async function seedUsers() {
  await testDb.insert(appUser).values([
    { id: ADMIN, role: 'admin', displayName: 'Admin' },
    { id: OFFICE, role: 'office', displayName: 'Office' },
    { id: WAREHOUSE, role: 'warehouse', displayName: 'Warehouse' },
  ]);
}

async function call(method: string, body: unknown, role: 'admin' | 'office' | 'warehouse', userId: string): Promise<CallResult<any>> {
  const token = await mintTestJwt({ userId, role });
  return callHandler(indexHandler, {
    method,
    url: '/api/customers',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body ?? undefined,
  });
}

describe('POST /api/customers', () => {
  beforeEach(async () => {
    await truncateAll();
    await seedUsers();
  });

  it('admin can create a customer', async () => {
    const res = await call('POST', { name: 'Smith Estate', sellerCode: 'SMTH001' }, 'admin', ADMIN);
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Smith Estate');
    expect(res.body.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('office can create a customer', async () => {
    const res = await call('POST', { name: 'Jones Family', sellerCode: 'JONE004' }, 'office', OFFICE);
    expect(res.status).toBe(201);
  });

  it('warehouse cannot create a customer', async () => {
    const res = await call('POST', { name: 'Nope', sellerCode: 'NOPE001' }, 'warehouse', WAREHOUSE);
    expect(res.status).toBe(403);
  });

  it('rejects empty name', async () => {
    const res = await call('POST', { name: '', sellerCode: 'X' }, 'admin', ADMIN);
    expect(res.status).toBe(400);
  });

  it('rejects missing auth', async () => {
    const res = await callHandler(indexHandler, {
      method: 'POST',
      url: '/api/customers',
      headers: { 'Content-Type': 'application/json' },
      body: { name: 'X', sellerCode: 'X1' },
    });
    expect(res.status).toBe(401);
  });
});

describe('GET /api/customers', () => {
  beforeEach(async () => {
    await truncateAll();
    await seedUsers();
  });

  it('lists customers for any authenticated role', async () => {
    await call('POST', { name: 'A', sellerCode: 'A1' }, 'admin', ADMIN);
    await call('POST', { name: 'B', sellerCode: 'B1' }, 'admin', ADMIN);
    const res = await call('GET', null, 'warehouse', WAREHOUSE);
    expect(res.status).toBe(200);
    expect(res.body.customers).toHaveLength(2);
    expect(res.body.customers.map((c: any) => c.name).sort()).toEqual(['A', 'B']);
  });
});

async function callId(id: string, method: string, body: unknown, role: 'admin' | 'office' | 'warehouse', userId: string): Promise<CallResult<any>> {
  const token = await mintTestJwt({ userId, role });
  return callHandler(idHandler, {
    method,
    url: `/api/customers/${id}?id=${id}`,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body ?? undefined,
  });
}

describe('PATCH /api/customers/:id', () => {
  beforeEach(async () => { await truncateAll(); await seedUsers(); });

  it('admin updates name', async () => {
    const created = (await call('POST', { name: 'Old', sellerCode: 'OLD1' }, 'admin', ADMIN)).body;
    const res = await callId(created.id, 'PATCH', { name: 'New' }, 'admin', ADMIN);
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('New');
  });

  it('warehouse cannot update', async () => {
    const created = (await call('POST', { name: 'X', sellerCode: 'X1' }, 'admin', ADMIN)).body;
    const res = await callId(created.id, 'PATCH', { name: 'Y' }, 'warehouse', WAREHOUSE);
    expect(res.status).toBe(403);
  });

  // Phase 7: cascade label_reprint_needed when customer.name changes —
  // every lot in every job belonging to this customer has a stale label.
  describe('label reprint cascade on name change', () => {
    async function seedCustomerWithLots(name: string) {
      const [c] = await testDb.insert(customer).values({ name, sellerCode: 'SC' }).returning();
      const [j1] = await testDb.insert(job).values({ customerId: c.id, jobNumber: 'J1' }).returning();
      const [j2] = await testDb.insert(job).values({ customerId: c.id, jobNumber: 'J2' }).returning();
      const lots = await testDb.insert(lot).values([
        { jobId: j1.id, lotNumber: 10, state: 'assigned', source: 'imported', intakeOperatorId: ADMIN },
        { jobId: j1.id, lotNumber: 11, state: 'assigned', source: 'imported', intakeOperatorId: ADMIN },
        { jobId: j2.id, lotNumber: 10, state: 'assigned', source: 'imported', intakeOperatorId: ADMIN },
      ]).returning();
      return { customerId: c.id, lotIds: lots.map((l) => l.id) };
    }

    it('cascades flag to every lot in every job when name changes', async () => {
      const { customerId, lotIds } = await seedCustomerWithLots('OldName');
      // A sibling customer with its own lot — must remain unflagged.
      const [sibling] = await testDb.insert(customer).values({ name: 'Sibling' }).returning();
      const [sj] = await testDb.insert(job).values({ customerId: sibling.id, jobNumber: 'SJ' }).returning();
      const [siblingLot] = await testDb.insert(lot).values({
        jobId: sj.id, lotNumber: 10, state: 'assigned', source: 'imported', intakeOperatorId: ADMIN,
      }).returning();

      const res = await callId(customerId, 'PATCH', { name: 'NewName' }, 'admin', ADMIN);
      expect(res.status).toBe(200);

      const flagged = await testDb.select().from(lot);
      const target = flagged.filter((l) => lotIds.includes(l.id));
      expect(target).toHaveLength(3);
      expect(target.every((l) => l.labelReprintNeeded === true)).toBe(true);
      const sib = flagged.find((l) => l.id === siblingLot.id)!;
      expect(sib.labelReprintNeeded).toBe(false);
    });

    it('does NOT cascade when only sellerCode changes', async () => {
      const { customerId, lotIds } = await seedCustomerWithLots('Same');
      const res = await callId(customerId, 'PATCH', { sellerCode: 'NEW1' }, 'admin', ADMIN);
      expect(res.status).toBe(200);
      const rows = await testDb.select().from(lot);
      expect(rows.filter((l) => lotIds.includes(l.id)).every((l) => l.labelReprintNeeded === false)).toBe(true);
    });

    it('does NOT cascade when name PATCH provides the same value', async () => {
      const { customerId, lotIds } = await seedCustomerWithLots('Identical');
      const res = await callId(customerId, 'PATCH', { name: 'Identical' }, 'admin', ADMIN);
      expect(res.status).toBe(200);
      const rows = await testDb.select().from(lot);
      expect(rows.filter((l) => lotIds.includes(l.id)).every((l) => l.labelReprintNeeded === false)).toBe(true);
    });

    it('does NOT cascade on disabled toggle alone', async () => {
      const { customerId, lotIds } = await seedCustomerWithLots('DisableMe');
      const res = await callId(customerId, 'PATCH', { disabled: true }, 'admin', ADMIN);
      expect(res.status).toBe(200);
      const rows = await testDb.select().from(lot).where(eq(lot.id, lotIds[0]));
      expect(rows[0].labelReprintNeeded).toBe(false);
    });
  });
});

describe('DELETE /api/customers/:id', () => {
  beforeEach(async () => { await truncateAll(); await seedUsers(); });

  it('admin deletes', async () => {
    const created = (await call('POST', { name: 'X', sellerCode: 'X1' }, 'admin', ADMIN)).body;
    const res = await callId(created.id, 'DELETE', null, 'admin', ADMIN);
    expect(res.status).toBe(200);
  });

  it('office cannot delete', async () => {
    const created = (await call('POST', { name: 'X', sellerCode: 'X1' }, 'admin', ADMIN)).body;
    const res = await callId(created.id, 'DELETE', null, 'office', OFFICE);
    expect(res.status).toBe(403);
  });
});
