// scripts/probe-ai.ts
// Real-Anthropic end-to-end probe. Picks N eligible lots from Dev DB,
// runs the full pipeline, prints results. Used for prompt tuning during
// development and as part of manual sign-off.
//
// Usage: npm run probe:ai -- --lots 5
//        npm run probe:ai -- --lots 5 --write     (also persists to DB)

import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { sql } from 'drizzle-orm';
import * as schema from '../db/schema.js';
import { runAiForLot } from '../src/lib/ai/anthropic.js';
import {
  composeTitle, composeDescription, determineFieldStatus, mapStatus, buildErrorString,
} from '../src/lib/ai/compose.js';
import { createClient } from '@supabase/supabase-js';

const args = process.argv.slice(2);
const lotsArg = args.indexOf('--lots');
const lotsCount = lotsArg >= 0 ? parseInt(args[lotsArg + 1], 10) : 3;
const shouldWrite = args.includes('--write');

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not set');
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL not set');

  const client = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });
  const db = drizzle(client, { schema });

  console.log(`probe-ai: fetching ${lotsCount} eligible lots from ${process.env.DATABASE_URL}`);

  const eligible = await db.execute<{
    id: string; quantity: number;
    special_notes_category: 'None' | 'TOOL ONLY' | 'READ' | 'CLOTHING';
    special_notes_text: string | null;
    untested: boolean; ref1: string | null; ref2: string | null;
  }>(sql`
    SELECT l.id, l.quantity, l.special_notes_category, l.special_notes_text,
           l.untested, l.ref1, l.ref2
      FROM lot l
     WHERE l.last_ai_run_status IS NULL
       AND l.state IN ('assigned', 'unassigned')
     ORDER BY l.intake_timestamp ASC
     LIMIT ${lotsCount}
  `);

  if (eligible.length === 0) {
    console.log('probe-ai: no eligible lots found');
    await client.end();
    return;
  }

  const supa = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let totalCostCents = 0;
  for (const row of eligible) {
    console.log(`\n──── Lot ${row.id} ────`);
    const photos = await db.execute<{ storage_path: string }>(sql`
      SELECT storage_path FROM lot_photo WHERE lot_id = ${row.id} AND status = 'uploaded'
    `);
    const photoUrls: string[] = [];
    for (const p of photos) {
      const { data } = await supa.storage.from('lot-photos').createSignedUrl(p.storage_path, 600, {
        transform: { width: 1568, quality: 80, resize: 'contain' },
      });
      if (data) photoUrls.push(data.signedUrl);
    }
    console.log(`  photos: ${photoUrls.length}`);

    const t0 = Date.now();
    try {
      const result = await runAiForLot({
        photoUrls,
        operatorFields: {
          quantity: row.quantity,
          specialNotesCategory: row.special_notes_category,
          specialNotesText: row.special_notes_text,
          untested: row.untested,
          ref1: row.ref1,
          ref2: row.ref2,
        },
      });
      const elapsed = Date.now() - t0;
      const fieldStatuses = determineFieldStatus({
        brand: result.output.brand,
        briefDescription: result.output.brief_description,
        descriptionBody: result.output.description_body,
        price: result.output.price,
      });
      const lotStatus = mapStatus(fieldStatuses);
      const newTitle = composeTitle({
        brand: result.output.brand,
        briefDescription: result.output.brief_description,
        price: result.output.price,
        quantity: row.quantity,
        specialNotesCategory: row.special_notes_category,
      });
      const newDescription = composeDescription({
        body: result.output.description_body,
        specialNotesCategory: row.special_notes_category,
        specialNotesText: row.special_notes_text,
        untested: row.untested,
      });
      console.log(`  status: ${lotStatus}  (${elapsed}ms, ${result.inputTokens}in/${result.outputTokens}out, ${result.costCents}¢)`);
      console.log(`  title: ${newTitle}`);
      console.log(`  description: ${newDescription}`);
      console.log(`  price: ${result.output.price}`);
      totalCostCents += result.costCents;

      if (shouldWrite) {
        await db.execute(sql`
          UPDATE lot SET title = ${newTitle},
            description = ${newDescription},
            price = ${result.output.price?.toFixed(2) ?? null},
            last_ai_run_status = ${lotStatus},
            last_ai_run_error = ${buildErrorString(fieldStatuses)},
            updated_at = NOW()
           WHERE id = ${row.id}
        `);
        console.log(`  → wrote to DB`);
      }
    } catch (err) {
      console.error(`  ERROR: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log(`\n────────────────────`);
  console.log(`Total: ${eligible.length} lots, ${totalCostCents}¢ ($${(totalCostCents / 100).toFixed(2)})`);
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
