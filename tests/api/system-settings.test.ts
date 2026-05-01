// tests/api/system-settings.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { testDb, truncateAll } from '../helpers/test-db';
import { mintTestJwt } from '../helpers/test-jwt';
import { callHandler, type CallResult } from '../helpers/call-handler';
import { appUser, systemSettings } from '../../db/schema';
import handler from '../../api/system-settings';

const ADMIN = '00000000-0000-0000-0000-000000000001';
const OFFICE = '00000000-0000-0000-0000-000000000002';

async function seedFixtures() {
  await testDb.insert(systemSettings).values({ id: 1 }).onConflictDoNothing();
  await testDb.insert(appUser).values([
    { id: ADMIN, role: 'admin', displayName: 'A' },
    { id: OFFICE, role: 'office', displayName: 'O' },
  ]);
}

async function call(method: string, body: unknown, role: 'admin' | 'office' = 'admin', userId = ADMIN): Promise<CallResult<any>> {
  const token = await mintTestJwt({ userId, role });
  return callHandler(handler, {
    method, url: '/api/system-settings',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body ?? undefined,
  });
}

describe('GET /api/system-settings', () => {
  beforeEach(async () => { await truncateAll(); await seedFixtures(); });

  it('returns the singleton row', async () => {
    const res = await call('GET', null);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(1);
  });

  it('any authenticated role can read', async () => {
    const res = await call('GET', null, 'office', OFFICE);
    expect(res.status).toBe(200);
  });
});

describe('PATCH /api/system-settings', () => {
  beforeEach(async () => { await truncateAll(); await seedFixtures(); });

  it('admin updates labelPrinterHelperUrl', async () => {
    const res = await call('PATCH', { labelPrinterHelperUrl: 'http://localhost:9100' });
    expect(res.status).toBe(200);
    expect(res.body.labelPrinterHelperUrl).toBe('http://localhost:9100');
  });

  it('admin can clear labelPrinterHelperUrl with null', async () => {
    await call('PATCH', { labelPrinterHelperUrl: 'http://localhost:9100' });
    const res = await call('PATCH', { labelPrinterHelperUrl: null });
    expect(res.status).toBe(200);
    expect(res.body.labelPrinterHelperUrl).toBeNull();
  });

  it('office cannot patch (403)', async () => {
    const res = await call('PATCH', { labelPrinterHelperUrl: 'x' }, 'office', OFFICE);
    expect(res.status).toBe(403);
  });

  it('rejects unknown field (strict schema)', async () => {
    const res = await call('PATCH', { aiScheduleEnabled: false });
    expect(res.status).toBe(400);
  });

  it('rejects non-URL string', async () => {
    const res = await call('PATCH', { labelPrinterHelperUrl: 'not-a-url' });
    expect(res.status).toBe(400);
  });
});
