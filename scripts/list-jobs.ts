import 'dotenv/config';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq } from 'drizzle-orm';
import * as schema from '../db/schema';

const url = process.env.DATABASE_URL;
if (!url) { console.error('no DATABASE_URL'); process.exit(1); }
const client = postgres(url, { prepare: false, max: 1 });
const db = drizzle(client, { schema });

(async () => {
  const rows = await db
    .select({
      customerName: schema.customer.name,
      jobId: schema.job.id, jobNumber: schema.job.jobNumber, closedAt: schema.job.closedAt,
    })
    .from(schema.job)
    .leftJoin(schema.customer, eq(schema.job.customerId, schema.customer.id))
    .orderBy(schema.customer.name, schema.job.jobNumber);
  for (const r of rows) console.log(`${r.customerName?.padEnd(20)}  ${r.jobNumber.padEnd(40)}  closed=${r.closedAt ? 'YES' : 'no'}  ${r.jobId}`);
  await client.end();
})();
