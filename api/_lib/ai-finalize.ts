// api/_lib/ai-finalize.ts
// Atomic "finalize an AI run" operation shared between /api/ai/run
// (single-lot endpoint) and /api/ai/backlog's processOne (queue runner).
// Inside one transaction it:
//   1. SELECTs the lot's current title / description / price so the
//      UPDATE can preserve operator-entered values that exist before
//      the AI run.
//   2. UPDATEs the lot row with status + error + cleared lock + bumped
//      updated_at. Title / description / price are only written when
//      (a) the caller explicitly passed them AND (b) the current value
//      in the DB is empty (NULL or '' for text; NULL for price). This
//      means a partial manual-entry lot keeps the operator's fields
//      and AI fills only the gaps.
//   3. Bumps the system_settings cost counters.
//   4. SELECTs the freshly-updated lot row and returns it.
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
  // When passed, a field is written only if the current DB value is
  // empty — operator entries are never clobbered by AI output.
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
  const exec = async (tx: Parameters<Parameters<typeof asActor>[1]>[0]) => {
    // Read current values before deciding which AI outputs to apply. The
    // SELECT lives inside the same transaction so a concurrent operator
    // edit can't race the field-emptiness check.
    const [current] = await tx
      .select({ title: lot.title, description: lot.description, price: lot.price })
      .from(lot)
      .where(eq(lot.id, lotId));

    const setClause: Partial<typeof lot.$inferInsert> = {
      lastAiRunStatus: fields.lastAiRunStatus,
      lastAiRunError: fields.lastAiRunError,
      aiProcessingStartedAt: null,
      updatedAt: new Date(),
    };
    if ('title' in fields && (current?.title === null || current?.title === '')) {
      setClause.title = fields.title;
    }
    if ('description' in fields && (current?.description === null || current?.description === '')) {
      setClause.description = fields.description;
    }
    if ('price' in fields && current?.price === null) {
      setClause.price = fields.price;
    }

    await tx.update(lot).set(setClause).where(eq(lot.id, lotId));
    await bumpAiCounters(tx, costCents);
    const [row] = await tx.select().from(lot).where(eq(lot.id, lotId));
    return row;
  };
  return operatorUserId
    ? asActor(operatorUserId, exec)
    : getDb().transaction(exec);
}
