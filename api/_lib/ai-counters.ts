// api/_lib/ai-counters.ts
// Shared system_settings AI counter increment used by /api/ai/run and
// /api/ai/backlog. The MTD counter resets to the new cost when the
// calendar month has flipped since `ai_cost_mtd_started_at`; the
// lifetime counters always accumulate. Future changes to MTD-rollover
// semantics happen in one place.

import { sql } from 'drizzle-orm';
import type { Transaction } from './db.js';

export function bumpAiCounters(tx: Transaction, costCents: number) {
  return tx.execute(sql`
    UPDATE system_settings SET
      ai_cost_mtd_cents = CASE
        WHEN date_trunc('month', ai_cost_mtd_started_at) < date_trunc('month', NOW())
          THEN ${costCents}
        ELSE ai_cost_mtd_cents + ${costCents}
      END,
      ai_cost_mtd_started_at = CASE
        WHEN date_trunc('month', ai_cost_mtd_started_at) < date_trunc('month', NOW())
          THEN NOW()
        ELSE ai_cost_mtd_started_at
      END,
      ai_cost_lifetime_cents = ai_cost_lifetime_cents + ${costCents},
      ai_run_count_lifetime = ai_run_count_lifetime + 1,
      updated_at = NOW()
     WHERE id = 1
  `);
}
