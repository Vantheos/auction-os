// api/_lib/ai-finalize.ts
// Atomic "finalize an AI run" operation shared between /api/ai/run
// (single-lot endpoint) and /api/ai/backlog's processOne (queue runner).
// Inside one transaction it:
//   1. UPDATEs the lot row with the optional AI outputs + status + error,
//      clears `ai_processing_started_at`, bumps `updated_at`. Title /
//      description / price are only set when explicitly passed — omitting
//      them preserves whatever the lot currently has (matters on the
//      failure path, where we don't want to clobber any pre-AI values).
//   2. Bumps the system_settings cost counters.
//   3. SELECTs the freshly-updated lot row and returns it.
//
// Routes through `asActor(operatorUserId, ...)` when a user-driven run
// (Run Now button or single-lot trigger) so the audit_log_trigger
// records the operator. Routes through bare `getDb().transaction(...)`
// for cron-driven runs (changed_by = NULL is correct for system).

import { eq } from 'drizzle-orm';
import { asActor, getDb } from './db.js';
import { bumpAiCounters } from './ai-counters.js';
import { lot } from '../../db/schema.js';

export type AiFinalizeFields = {
  // Pass to set; omit to preserve. Failure paths typically omit all three.
  title?: string | null;
  description?: string | null;
  price?: string | null;
  lastAiRunStatus: 'success' | 'partial' | 'failure';
  lastAiRunError: string | null;
};

export async function finalizeLotRun(
  lotId: string,
  operatorUserId: string | null,
  fields: AiFinalizeFields,
  costCents: number,
): Promise<typeof lot.$inferSelect> {
  // Build the SET clause from only the fields the caller actually
  // provided so we don't clobber values that were already set by an
  // operator before the AI run.
  const setClause: Partial<typeof lot.$inferInsert> = {
    lastAiRunStatus: fields.lastAiRunStatus,
    lastAiRunError: fields.lastAiRunError,
    aiProcessingStartedAt: null,
    updatedAt: new Date(),
  };
  if ('title' in fields) setClause.title = fields.title;
  if ('description' in fields) setClause.description = fields.description;
  if ('price' in fields) setClause.price = fields.price;

  const exec = async (tx: Parameters<Parameters<typeof asActor>[1]>[0]) => {
    await tx.update(lot).set(setClause).where(eq(lot.id, lotId));
    await bumpAiCounters(tx, costCents);
    const [row] = await tx.select().from(lot).where(eq(lot.id, lotId));
    return row;
  };
  return operatorUserId
    ? asActor(operatorUserId, exec)
    : getDb().transaction(exec);
}
