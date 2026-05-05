// scripts/apply-migration.ts
//
// Applies a single migration SQL file to the configured DATABASE_URL.
// Replaces `npm run db:push` for hand-written migrations because
// drizzle-kit ^0.28 crashes when introspecting existing CHECK constraints
// on lot.state_tuple_consistent.
//
// Usage:
//   npx tsx scripts/apply-migration.ts supabase/migrations/0011_phase_5_auction_platform_export.sql
//
// To target Test instead of Dev, source .env.test before invocation:
//   set -a && source .env.test && set +a && npx tsx scripts/apply-migration.ts <file>
//
// (Or override DATABASE_URL inline: DATABASE_URL=$TEST_URL npx tsx ...)
import 'dotenv/config';
import postgres from 'postgres';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL not set. Source .env or .env.test first.');
  process.exit(1);
}

const arg = process.argv[2];
if (!arg) {
  console.error('Usage: tsx scripts/apply-migration.ts <path-to-sql-file>');
  process.exit(1);
}

const filepath = resolve(process.cwd(), arg);
const sql = readFileSync(filepath, 'utf8');

const client = postgres(url, { prepare: false, max: 1 });

(async () => {
  try {
    console.log(`Applying ${filepath}`);
    console.log(`  → ${url.replace(/:[^:@]+@/, ':***@')}`);
    await client.unsafe(sql);
    console.log('Migration applied successfully.');
  } catch (e) {
    console.error('Migration failed:', e instanceof Error ? e.message : String(e));
    process.exitCode = 1;
  } finally {
    await client.end();
  }
})();
