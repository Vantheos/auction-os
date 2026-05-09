// api/_lib/lot-numbering.ts
// Lot-number allocation helper. Fills the lowest gap in the job's
// 10..MAX(lot_number) sequence before extending past the max — operators
// flagged that the AF360 export to the auction platform requires sequential
// lot numbers, and a delete or unassign in the middle of a job leaves a
// hole that we want subsequent additions to backfill automatically.
//
// Caller must hold the per-job advisory lock (see the existing
// `pg_advisory_xact_lock(hashtext(jobId))` pattern in the three call sites)
// so concurrent allocators don't race the same gap.

import { sql } from 'drizzle-orm';
import type { Database, Transaction } from './db.js';

/**
 * Compute the next available lot_number in a job: the lowest integer ≥ 10
 * not currently used in `lot.lot_number` for that job. Returns 10 when the
 * job has no lots.
 *
 * Algorithm: generate_series(10, COALESCE(MAX(lot_number), 9) + 1) and pick
 * the first value not present. The series degenerates to [10] for an empty
 * job; the +1 bound ensures we always have at least one candidate past the
 * current max for the no-gaps case.
 */
export async function nextLotNumberForJob(
  tx: Database | Transaction,
  jobId: string,
): Promise<number> {
  const rows = await tx.execute<{ n: number }>(sql`
    SELECT COALESCE(
      (SELECT MIN(s.n)
         FROM generate_series(
           10,
           COALESCE((SELECT MAX(lot_number) FROM lot WHERE job_id = ${jobId}), 9) + 1
         ) AS s(n)
        WHERE NOT EXISTS (
          SELECT 1 FROM lot WHERE job_id = ${jobId} AND lot_number = s.n
        )),
      10
    )::int AS n
  `);
  return rows[0]?.n ?? 10;
}
