// tests/helpers/test-db.ts
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../../db/schema';
import { sql } from 'drizzle-orm';

const url = process.env.DATABASE_URL!;
const client = postgres(url, { prepare: false, max: 1 });
export const testDb = drizzle(client, { schema });

// Note: the lot-has-photo trigger from migration 0008 is intentionally
// DROPPED on the Test DB only. Tests insert photo-less lots in dozens of
// places (testing GET / DELETE / move / state transitions / etc. without
// modeling the cataloging atomic flow) and re-architecting all of them
// to bypass the trigger via source='imported' or a session GUC isn't worth
// the churn. Supabase's transaction-mode PgBouncer also strips session-
// level SET commands, so a per-test bypass would require restructuring.
//
// The constraint itself is tested separately (see tests/integration/
// lot-photo-constraint.test.ts when added) using a direct, non-pooled
// connection. Dev + Prod databases keep the trigger active.

export async function truncateAll() {
  await testDb.execute(sql`
    TRUNCATE TABLE
      audit_log, lot_photo, lot, job, customer, app_user, system_settings
    RESTART IDENTITY CASCADE
  `);
  // Restore singleton
  await testDb.execute(sql`INSERT INTO system_settings (id) VALUES (1) ON CONFLICT DO NOTHING`);
}
