// scripts/seed-admin.ts
// Provisions an initial admin user in the Dev Supabase project.
// Creates the auth.users entry via the Admin API, then upserts the app_user row.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { appUser } from '../db/schema';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DB_URL = process.env.DATABASE_URL;
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@auction-os.local';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'admin1234!';
const ADMIN_NAME = process.env.SEED_ADMIN_NAME ?? 'Initial Admin';

if (!SUPABASE_URL || !SERVICE_KEY || !DB_URL) {
  console.error('Missing env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DATABASE_URL required');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const db = drizzle(postgres(DB_URL, { prepare: false }));

async function main() {
  // 1. Create the auth user (or fetch if it exists)
  const { data: created, error: createErr } = await supabase.auth.admin.createUser({
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    email_confirm: true,
  });

  let userId: string;
  if (createErr && createErr.message.includes('already')) {
    const { data: list } = await supabase.auth.admin.listUsers();
    const existing = list.users.find((u) => u.email === ADMIN_EMAIL);
    if (!existing) throw new Error('Admin user supposedly exists but cannot be located');
    userId = existing.id;
    console.log(`Reusing existing auth user ${userId}`);
  } else if (createErr) {
    throw createErr;
  } else {
    userId = created.user!.id;
    console.log(`Created auth user ${userId}`);
  }

  // 2. Upsert the app_user row with role=admin
  await db
    .insert(appUser)
    .values({ id: userId, role: 'admin', displayName: ADMIN_NAME })
    .onConflictDoUpdate({ target: appUser.id, set: { role: 'admin', displayName: ADMIN_NAME } });

  console.log(`Seeded admin: ${ADMIN_EMAIL}`);
  console.log(`Password: ${ADMIN_PASSWORD}`);
  console.log('Change this password before any deployment to a shared environment.');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
