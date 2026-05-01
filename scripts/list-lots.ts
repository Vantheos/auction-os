// scripts/list-lots.ts — quick diagnostic for active sign-off testing
import 'dotenv/config';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from '../db/schema';

const url = process.env.DATABASE_URL;
if (!url) { console.error('no DATABASE_URL'); process.exit(1); }
const client = postgres(url, { prepare: false, max: 1 });
const db = drizzle(client, { schema });

(async () => {
  const lots = await db.select({
    id: schema.lot.id, lotNumber: schema.lot.lotNumber, state: schema.lot.state,
    quantity: schema.lot.quantity, title: schema.lot.title,
  }).from(schema.lot).orderBy(schema.lot.lotNumber);
  for (const l of lots) console.log(`#${l.lotNumber}  ${l.state.padEnd(13)}  qty=${l.quantity}  ${l.id}  | ${l.title}`);
  await client.end();
})();
