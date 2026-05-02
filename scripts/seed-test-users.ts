// scripts/seed-test-users.ts
// Provisions warehouse + office test users in the Dev Supabase project so
// Phase 3 sign-off can exercise role-aware behavior. Mirrors seed-admin.ts:
// creates auth.users entries via the Admin API, then upserts the matching
// app_user rows with the correct role.
//
// Idempotent: re-running updates the role + display_name if either drifted.
//
// Run with `npx tsx scripts/seed-test-users.ts`. Override defaults with
// env vars: SEED_OFFICE_EMAIL/SEED_OFFICE_PASSWORD,
//           SEED_WAREHOUSE_EMAIL/SEED_WAREHOUSE_PASSWORD.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { appUser } from '../db/schema';

type Role = 'admin' | 'office' | 'warehouse';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DB_URL = process.env.DATABASE_URL;

if (!SUPABASE_URL || !SERVICE_KEY || !DB_URL) {
  console.error('Missing env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DATABASE_URL required');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const db = drizzle(postgres(DB_URL, { prepare: false }));

const USERS: { email: string; password: string; role: Role; displayName: string }[] = [
  {
    email: process.env.SEED_OFFICE_EMAIL ?? 'office@auction-os.local',
    password: process.env.SEED_OFFICE_PASSWORD ?? 'office1234!',
    role: 'office',
    displayName: 'Test Office',
  },
  {
    email: process.env.SEED_WAREHOUSE_EMAIL ?? 'warehouse@auction-os.local',
    password: process.env.SEED_WAREHOUSE_PASSWORD ?? 'warehouse1234!',
    role: 'warehouse',
    displayName: 'Test Warehouse',
  },
];

async function ensureUser(u: typeof USERS[number]): Promise<string> {
  const { data: created, error: createErr } = await supabase.auth.admin.createUser({
    email: u.email,
    password: u.password,
    email_confirm: true,
  });
  if (createErr && createErr.message.includes('already')) {
    const { data: list } = await supabase.auth.admin.listUsers();
    const existing = list.users.find((x) => x.email === u.email);
    if (!existing) throw new Error(`User ${u.email} supposedly exists but cannot be located`);
    console.log(`  reusing auth user ${existing.id}`);
    return existing.id;
  }
  if (createErr) throw createErr;
  console.log(`  created auth user ${created.user!.id}`);
  return created.user!.id;
}

async function main() {
  for (const u of USERS) {
    console.log(`\n→ ${u.role}: ${u.email}`);
    const userId = await ensureUser(u);
    await db.insert(appUser)
      .values({ id: userId, role: u.role, displayName: u.displayName })
      .onConflictDoUpdate({ target: appUser.id, set: { role: u.role, displayName: u.displayName } });
    console.log(`  app_user upserted with role=${u.role}`);
  }
  console.log('\nDone. Test credentials:');
  for (const u of USERS) {
    console.log(`  ${u.role.padEnd(10)} ${u.email}  /  ${u.password}`);
  }
  console.log('\nLog in via the preview URL — the JWT custom-claim hook injects role into app_metadata at token issue.');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
