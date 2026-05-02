// tests/helpers/test-db.ts
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../../db/schema';
import { sql } from 'drizzle-orm';

const url = process.env.DATABASE_URL!;
const client = postgres(url, { prepare: false, max: 1 });
export const testDb = drizzle(client, { schema });

export async function truncateAll() {
  await testDb.execute(sql`
    TRUNCATE TABLE
      audit_log, lot_photo, lot, job, customer, app_user, system_settings
    RESTART IDENTITY CASCADE
  `);
  // Restore singleton
  await testDb.execute(sql`INSERT INTO system_settings (id) VALUES (1) ON CONFLICT DO NOTHING`);
}
