// scripts/seed-test-photos.ts
// Attaches 2–3 placeholder photos to every existing lot in Dev Supabase
// that doesn't already have any. Idempotent: lots that already have
// photos are skipped. Useful for Phase 3 sign-off so mobile inventory
// thumbnails + lot detail photo grid render against real Storage objects
// before going through the cataloging-then-display path.
//
// Source images: picsum.photos with a deterministic seed per photo so
// re-runs produce visually consistent results (same image for same lot).
//
// Run: npx tsx scripts/seed-test-photos.ts
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq, sql } from 'drizzle-orm';
import { lotPhoto, appUser } from '../db/schema';
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
const db = drizzle(postgres(DB_URL, { prepare: false }));

async function fetchSamplePhoto(seed: string): Promise<Buffer> {
  // 600×450 ≈ 30–50 KB JPEG; deterministic per seed
  const url = `https://picsum.photos/seed/${encodeURIComponent(seed)}/600/450`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`fetch ${url} → ${res.status}`);
  }
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
  // Pick any admin to attribute capturedBy to. Falls back to the first user in
  // the table if no admin exists. The script aborts if there are no users at all.
  const adminRows = await db.select({ id: appUser.id }).from(appUser).where(eq(appUser.role, 'admin')).limit(1);
  let actorId = adminRows[0]?.id;
  if (!actorId) {
    const anyUser = await db.select({ id: appUser.id }).from(appUser).limit(1);
    actorId = anyUser[0]?.id;
  }
  if (!actorId) {
    console.error('No app_user rows found. Run seed-admin first.');
    process.exit(1);
  }

  // All lots, with their current photo count joined in
  const lots = await db.execute<{ id: string; lot_number: number | null; photo_count: number }>(sql`
    SELECT l.id, l.lot_number,
           (SELECT COUNT(*)::int FROM lot_photo WHERE lot_id = l.id) AS photo_count
      FROM lot l
      ORDER BY l.created_at ASC
  `);

  let attached = 0;
  let skipped = 0;
  for (const row of lots) {
    if (row.photo_count > 0) {
      console.log(`  skip lot ${row.id.slice(0, 8)}… (already has ${row.photo_count} photos)`);
      skipped++;
      continue;
    }

    const numPhotos = 2 + (parseInt(row.id.replace(/[^0-9]/g, '').slice(0, 2) || '0', 10) % 2); // 2 or 3
    console.log(`→ lot ${row.id.slice(0, 8)}… (#${row.lot_number ?? '—'}) — adding ${numPhotos} photos`);

    for (let i = 0; i < numPhotos; i++) {
      const photoId = crypto.randomUUID();
      const seed = `${row.id}-${i}`;
      try {
        const buf = await fetchSamplePhoto(seed);
        const path = await uploadOne(row.id, photoId, buf);
        await db.insert(lotPhoto).values({
          id: photoId,
          lotId: row.id,
          storagePath: path,
          displayOrder: i + 1,
          status: 'uploaded',
          capturedBy: actorId,
        });
        console.log(`  ✓ photo ${i + 1}/${numPhotos} (${(buf.byteLength / 1024).toFixed(0)} KB)`);
      } catch (e) {
        console.error(`  ✗ photo ${i + 1}/${numPhotos}: ${String(e)}`);
      }
    }
    attached++;
  }

  console.log(`\nDone. ${attached} lots got photos, ${skipped} skipped (already had photos).`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
