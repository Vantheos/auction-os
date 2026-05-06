// api/_lib/ai-thresholds.ts
// Shared time thresholds for the Phase 6 AI subsystem. The same 5-minute
// value is used in three places, in two forms:
//   - SQL `interval '5 minutes'` for the eligibility / claim queries in
//     api/ai/run.ts and api/ai/backlog.ts (NOW() - threshold comparisons).
//   - JS milliseconds for the PATCH lock check in api/lots/[id].ts (Date
//     comparison on the in-memory DTO).
// Hoisted here so future tuning of the staleness window happens in one
// place.

import { sql } from 'drizzle-orm';

export const PER_LOT_STALE_THRESHOLD_MS = 5 * 60 * 1000;
export const PER_LOT_STALE_THRESHOLD_SQL = sql`interval '5 minutes'`;
