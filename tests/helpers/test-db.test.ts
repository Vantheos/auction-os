import { describe, it, expect, beforeEach } from 'vitest';
import { testDb, truncateAll } from './test-db';
import { customer } from '../../db/schema';

describe('test-db helper', () => {
  beforeEach(async () => { await truncateAll(); });

  it('starts each test with empty tables', async () => {
    const rows = await testDb.select().from(customer);
    expect(rows).toEqual([]);
  });
});
