// tests/lib/jwt-hook.test.ts
//
// Phase 4 Area 1: verifies the custom_access_token_hook gates on
// disabled_at IS NULL. Calls the Postgres function directly via SQL
// (test JWTs in our suite bypass the hook — they're minted directly,
// so end-to-end coverage requires invoking the function explicitly).
//
// The hook receives an `event` JSONB containing user_id + claims, and
// returns the same event with app_metadata.role set (or nulled).

import { describe, it, expect, beforeEach } from 'vitest';
import { sql } from 'drizzle-orm';
import { testDb, truncateAll } from '../helpers/test-db';
import { appUser } from '../../db/schema';

const USER_ID = '00000000-0000-0000-0000-000000000010';

type HookResult = {
  user_id: string;
  claims: { app_metadata: { role: string | null } };
};

async function callHook(userId: string): Promise<HookResult> {
  const event = { user_id: userId, claims: { app_metadata: {} } };
  const rows = await testDb.execute<{ result: HookResult }>(
    sql`SELECT public.custom_access_token_hook(${JSON.stringify(event)}::jsonb) AS result`,
  );
  return rows[0].result;
}

describe('custom_access_token_hook', () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it('writes app_metadata.role for an active user', async () => {
    await testDb.insert(appUser).values({ id: USER_ID, role: 'admin', displayName: 'Admin' });
    const result = await callHook(USER_ID);
    expect(result.claims.app_metadata.role).toBe('admin');
  });

  it('writes app_metadata.role = null for a disabled user', async () => {
    await testDb.insert(appUser).values({
      id: USER_ID,
      role: 'admin',
      displayName: 'Admin',
      disabledAt: new Date(),
    });
    const result = await callHook(USER_ID);
    expect(result.claims.app_metadata.role).toBeNull();
  });

  it('writes app_metadata.role = null when user does not exist', async () => {
    // No insert — user does not exist in app_user
    const result = await callHook(USER_ID);
    expect(result.claims.app_metadata.role).toBeNull();
  });

  it('preserves the role claim across enable → disable → re-enable cycles', async () => {
    await testDb.insert(appUser).values({ id: USER_ID, role: 'office', displayName: 'Office' });

    let result = await callHook(USER_ID);
    expect(result.claims.app_metadata.role).toBe('office');

    await testDb.update(appUser).set({ disabledAt: new Date() }).where(sql`id = ${USER_ID}::uuid`);
    result = await callHook(USER_ID);
    expect(result.claims.app_metadata.role).toBeNull();

    await testDb.update(appUser).set({ disabledAt: null }).where(sql`id = ${USER_ID}::uuid`);
    result = await callHook(USER_ID);
    expect(result.claims.app_metadata.role).toBe('office');
  });
});
