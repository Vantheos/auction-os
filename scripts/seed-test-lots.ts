// scripts/seed-test-lots.ts
// Seeds a deterministic set of test lots into the configured DATABASE_URL.
// Useful for Phase 2 manual verification. Idempotent — checks before insert.
import 'dotenv/config';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq, and } from 'drizzle-orm';
import * as schema from '../db/schema';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL not set. Run `npm run env:setup` first.');
  process.exit(1);
}

const client = postgres(url, { prepare: false, max: 1 });
const db = drizzle(client, { schema });

// Note on migration 0008: this script creates photo-less lots, which the
// lot-has-photo trigger normally rejects on Dev. Run seed-test-photos
// IMMEDIATELY after this seed script — by then the lots will have photos
// and the constraint is satisfied. If running this against a fresh Dev
// DB and the trigger fires, manually run seed-test-photos first or
// temporarily disable the triggers.

async function main() {
  // Find or create a test customer
  let [customer] = await db.select().from(schema.customer).where(eq(schema.customer.name, 'Test Estate'));
  if (!customer) {
    [customer] = await db.insert(schema.customer).values({ name: 'Test Estate' }).returning();
    console.log(`Created customer: ${customer.id}`);
  } else {
    console.log(`Reusing customer: ${customer.id}`);
  }

  // Find or create a test job
  let [job] = await db.select().from(schema.job).where(
    and(eq(schema.job.customerId, customer.id), eq(schema.job.jobNumber, '2026-04-Test-001'))
  );
  if (!job) {
    [job] = await db.insert(schema.job).values({ customerId: customer.id, jobNumber: '2026-04-Test-001' }).returning();
    console.log(`Created job: ${job.id}`);
  } else {
    console.log(`Reusing job: ${job.id}`);
  }

  // Find an admin user (Phase 1 seed-admin should have already run)
  const [admin] = await db.select().from(schema.appUser).where(eq(schema.appUser.role, 'admin'));
  if (!admin) {
    console.error('No admin user found. Run `npm run seed:admin` first.');
    await client.end();
    process.exit(1);
  }
  console.log(`Using admin operator: ${admin.id}`);

  // Skip if already seeded
  const existing = await db.select().from(schema.lot).where(eq(schema.lot.jobId, job.id));
  if (existing.length > 0) {
    console.log(`Job already has ${existing.length} lots. Skipping seed.`);
    await client.end();
    return;
  }

  type LotSeed = {
    lotNumber: number;
    state: 'assigned' | 'sold' | 'picked-up';
    title: string;
    price: string;
    specialNotesCategory: 'None' | 'TOOL ONLY' | 'READ' | 'CLOTHING';
    specialNotesText?: string;
    untested: boolean;
    quantity?: number;
  };

  const lots: LotSeed[] = [
    { lotNumber: 10, state: 'assigned', title: '$45- 1x Antique Brass Vase', price: '45.00', specialNotesCategory: 'TOOL ONLY', untested: false },
    { lotNumber: 11, state: 'assigned', title: '$120- 1x Walnut Dining Chair', price: '120.00', specialNotesCategory: 'None', untested: false },
    { lotNumber: 12, state: 'sold', title: '$15- 3x Vintage Mason Jar', price: '15.00', specialNotesCategory: 'None', untested: false, quantity: 3 },
    { lotNumber: 13, state: 'picked-up', title: '$80- 1x Levi 501 Denim Jacket', price: '80.00', specialNotesCategory: 'CLOTHING', specialNotesText: 'L', untested: false },
    { lotNumber: 14, state: 'assigned', title: '$60- 1x Cast Iron Skillet UNTESTED', price: '60.00', specialNotesCategory: 'None', untested: true },
  ];

  for (const l of lots) {
    await db.insert(schema.lot).values({
      jobId: job.id,
      lotNumber: l.lotNumber,
      state: l.state,
      title: l.title,
      price: l.price,
      specialNotesCategory: l.specialNotesCategory,
      specialNotesText: l.specialNotesText ?? null,
      untested: l.untested,
      quantity: l.quantity ?? 1,
      intakeOperatorId: admin.id,
    });
  }

  // Plus one unassigned lot (cleared tuple per state_tuple_consistent CHECK)
  await db.insert(schema.lot).values({
    jobId: null,
    lotNumber: null,
    state: 'unassigned',
    title: '$$$- 1x Mystery Item',
    intakeOperatorId: admin.id,
    quantity: 1,
  });

  console.log(`Seeded ${lots.length + 1} test lots into ${customer.name} / ${job.jobNumber}`);
  await client.end();
}

main().catch(async (e) => { console.error(e); await client.end(); process.exit(1); });
