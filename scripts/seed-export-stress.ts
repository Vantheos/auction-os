// scripts/seed-export-stress.ts
// Phase 5 multi-batch export stress fixture.
//
// Creates a dedicated "Stress Test Co" customer + "STRESS-2026-05-05" job
// in Dev, then seeds 120 assigned lots with 1–3 photos each. Designed to
// exercise the AF360 export pipeline at multi-batch scale (120 lots →
// 2 batches: 100 + 20) so we verify the sequential client orchestration
// against real data before signing Phase 5 off.
//
// Idempotent: re-runs skip the seed if the job already has any lots.
// Clean up by deleting the customer (cascades to job + lots + photos)
// via Supabase Studio when no longer needed.
//
// Run: npx tsx scripts/seed-export-stress.ts
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq, and } from 'drizzle-orm';
import { customer, job, lot, lotPhoto, appUser } from '../db/schema';
import crypto from 'node:crypto';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DB_URL = process.env.DATABASE_URL;
const BUCKET = 'lot-photos';

if (!SUPABASE_URL || !SERVICE_KEY || !DB_URL) {
  console.error('Missing env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DATABASE_URL required');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const client = postgres(DB_URL, { prepare: false, max: 1 });
const db = drizzle(client);

const STRESS_CUSTOMER_NAME = 'Stress Test Co';
const STRESS_SELLER_CODE = 'STRESS001';
const STRESS_JOB_NUMBER = 'STRESS-2026-05-05';
const STRESS_LOT_COUNT = 120;

// Title fixtures — varied enough to feel realistic during sign-off
// click-through and to give the AF360 CSV's Title column some natural
// variety. Includes a few that exercise the 50-char silent-truncation
// path (the long-titled ones).
const TITLE_FIXTURES = [
  'Vintage Oak Dining Chair',
  'Cast Iron Skillet (10 inch)',
  'Antique Brass Table Lamp',
  'Mid-Century Modern Side Table',
  'Set of 4 Crystal Champagne Flutes',
  'Hand-Carved Wooden Bowl',
  'Pewter Candlesticks Pair',
  'Persian Wool Area Rug',
  'Levi 501 Denim Jacket Size L',
  'Stainless Steel Mixing Bowls Set',
  'Carved Mahogany Bookend Pair',
  'Vintage Polaroid SX-70 Camera',
  'Hand-Painted Ceramic Vase',
  'Wrought Iron Garden Bench',
  'Brass Telescope Antique Reproduction Working Condition',
  'Walnut Coffee Table with Glass Top',
  'Stoneware Crock 2 Gallon',
  'Edwardian Sterling Silver Tea Service Six Piece Set',
  'Rustic Wooden Crate',
  'Beveled Glass Mirror in Gilded Frame',
  'Cashmere Throw Blanket',
  'Carved Stone Bookends',
  'Vintage Leather Suitcase',
  'Hand-Forged Iron Trivet Set',
];

const DESCRIPTION_FIXTURES = [
  'Excellent condition. Minor surface wear consistent with age. Pickup only or arrange shipping with auctioneer.',
  'Sturdy construction with original hardware. Some patina to surface. Functions as intended.',
  'No chips, cracks, or repairs noted. Clean and ready to use or display. Photographs are part of the description.',
  'Vintage piece with character. See photos for full condition details. Sold as-is.',
  'Working order verified. Cosmetic wear typical of age. Stored in climate-controlled environment.',
  'Solid build, heavy. Original finish preserved. Light scratches do not affect function.',
];

function photoCountFor(lotNumber: number): number {
  // Distribution target across 120 lots: ~20% triple, ~50% double, ~30%
  // single. Deterministic from lotNumber so re-runs are stable.
  const mod = lotNumber % 10;
  if (mod < 2) return 3;
  if (mod < 7) return 2;
  return 1;
}

function quantityFor(lotNumber: number): number {
  // Most lots quantity=1; ~10% are multi-quantity to exercise the CSV's
  // Quantity column with non-default values.
  if (lotNumber % 10 === 9) return 3;
  if (lotNumber % 10 === 4) return 2;
  return 1;
}

async function fetchSamplePhoto(seed: string): Promise<Buffer> {
  // 600×450 ≈ 30–50 KB JPEG; deterministic per seed
  const url = `https://picsum.photos/seed/${encodeURIComponent(seed)}/600/450`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url} → ${res.status}`);
  const buf = await res.arrayBuffer();
  return Buffer.from(buf);
}

async function uploadOne(lotId: string, photoId: string, buf: Buffer): Promise<string> {
  const path = `lots/${lotId}/${photoId}.jpg`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, buf, {
    contentType: 'image/jpeg',
    upsert: true,
  });
  if (error) throw new Error(`upload ${path}: ${error.message}`);
  return path;
}

async function main() {
  console.log(`Targeting Dev DB at ${DB_URL!.replace(/:[^:@]+@/, ':***@')}\n`);

  // Resolve admin for intakeOperatorId + capturedBy attribution.
  const [admin] = await db.select().from(appUser).where(eq(appUser.role, 'admin')).limit(1);
  if (!admin) {
    console.error('No admin user found. Run `npm run seed:admin` first.');
    await client.end();
    process.exit(1);
  }
  console.log(`Using admin operator: ${admin.id}`);

  // Find or create the stress-test customer.
  let [stressCustomer] = await db
    .select()
    .from(customer)
    .where(eq(customer.name, STRESS_CUSTOMER_NAME));
  if (!stressCustomer) {
    [stressCustomer] = await db
      .insert(customer)
      .values({ name: STRESS_CUSTOMER_NAME, sellerCode: STRESS_SELLER_CODE })
      .returning();
    console.log(`Created customer: ${stressCustomer.id} (${STRESS_CUSTOMER_NAME})`);
  } else {
    console.log(`Reusing customer: ${stressCustomer.id} (${STRESS_CUSTOMER_NAME})`);
  }

  // Find or create the stress-test job.
  let [stressJob] = await db
    .select()
    .from(job)
    .where(and(eq(job.customerId, stressCustomer.id), eq(job.jobNumber, STRESS_JOB_NUMBER)));
  if (!stressJob) {
    [stressJob] = await db
      .insert(job)
      .values({
        customerId: stressCustomer.id,
        jobNumber: STRESS_JOB_NUMBER,
        // Defaults: startBid=5.00, shippable=false. Explicit for clarity.
        startBid: '5.00',
        shippable: false,
      })
      .returning();
    console.log(`Created job: ${stressJob.id} (${STRESS_JOB_NUMBER})`);
  } else {
    console.log(`Reusing job: ${stressJob.id} (${STRESS_JOB_NUMBER})`);
  }

  // Idempotency check: if the job already has any lots, skip the seed.
  const existing = await db.select({ id: lot.id }).from(lot).where(eq(lot.jobId, stressJob.id));
  if (existing.length > 0) {
    console.log(
      `\nJob already has ${existing.length} lots — skipping seed. ` +
        `Delete the customer via Supabase Studio to re-seed from scratch.`
    );
    await client.end();
    return;
  }

  console.log(`\nSeeding ${STRESS_LOT_COUNT} lots into ${STRESS_CUSTOMER_NAME} / ${STRESS_JOB_NUMBER}...\n`);

  let totalPhotos = 0;
  let totalBytes = 0;
  const startTime = Date.now();

  for (let i = 1; i <= STRESS_LOT_COUNT; i++) {
    const title = TITLE_FIXTURES[(i - 1) % TITLE_FIXTURES.length];
    const description = DESCRIPTION_FIXTURES[(i - 1) % DESCRIPTION_FIXTURES.length];
    const photoCount = photoCountFor(i);
    const quantity = quantityFor(i);

    // Insert lot. source='imported' bypasses the cataloging photo trigger
    // so we can insert the lot row before its photos. Export endpoint
    // doesn't care about source — only about state='assigned'.
    const [createdLot] = await db
      .insert(lot)
      .values({
        jobId: stressJob.id,
        lotNumber: i,
        state: 'assigned' as const,
        source: 'imported' as const,
        title,
        description,
        quantity,
        intakeOperatorId: admin.id,
      })
      .returning();

    const photoLabels: string[] = [];
    for (let p = 0; p < photoCount; p++) {
      const photoId = crypto.randomUUID();
      const seed = `stress-${i}-${p}`;
      try {
        const buf = await fetchSamplePhoto(seed);
        const path = await uploadOne(createdLot.id, photoId, buf);
        await db.insert(lotPhoto).values({
          id: photoId,
          lotId: createdLot.id,
          storagePath: path,
          displayOrder: p + 1,
          status: 'uploaded' as const,
          capturedBy: admin.id,
        });
        photoLabels.push(`${(buf.byteLength / 1024).toFixed(0)}KB`);
        totalPhotos++;
        totalBytes += buf.byteLength;
      } catch (e) {
        console.error(`  ✗ lot ${i} photo ${p + 1}: ${String(e)}`);
      }
    }
    console.log(`  lot ${String(i).padStart(3)}: ${photoCount} photo${photoCount === 1 ? '' : 's'} [${photoLabels.join(', ')}]`);
  }

  const seconds = ((Date.now() - startTime) / 1000).toFixed(1);
  const totalMB = (totalBytes / 1024 / 1024).toFixed(1);
  console.log(
    `\nDone. ${STRESS_LOT_COUNT} lots + ${totalPhotos} photos (${totalMB} MB) in ${seconds}s.`
  );
  console.log(
    `\nNext: navigate to ${STRESS_CUSTOMER_NAME} / ${STRESS_JOB_NUMBER} in the app, click ` +
      `Export to AF360, and verify the multi-batch flow downloads 1 CSV + 2 image zips.`
  );

  await client.end();
}

main().catch(async (e) => {
  console.error(e);
  await client.end();
  process.exit(1);
});
