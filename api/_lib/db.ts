// api/_lib/db.ts
// Shared Drizzle client + actor-scoped transaction helper.
// Lambda warm reuse caches the postgres-js client across invocations.

import { drizzle } from 'drizzle-orm/postgres-js';
import type { PostgresJsQueryResultHKT } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import type { ExtractTablesWithRelations } from 'drizzle-orm/relations';
import type { PgTransaction } from 'drizzle-orm/pg-core';
import postgres from 'postgres';
import * as schema from '../../db/schema.js';

type Schema = typeof schema;

let _client: ReturnType<typeof postgres> | null = null;

function getClient() {
  if (_client) return _client;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set');
  // prepare: false → required for Supabase Shared Pooler (transaction-mode PgBouncer)
  // max: 1     → single connection per Lambda instance; concurrency is across instances
  return (_client = postgres(url, { prepare: false, max: 1 }));
}

export type Database = ReturnType<typeof drizzle<Schema>>;
export type Transaction = PgTransaction<PostgresJsQueryResultHKT, Schema, ExtractTablesWithRelations<Schema>>;

export function getDb(): Database {
  return drizzle(getClient(), { schema });
}

// Run `fn` inside a transaction with `request.jwt.claim.sub` set to `userId`,
// so the `audit_log_trigger` (which reads via `auth.uid()`) attributes every
// write to the actual user. PgBouncer transaction mode requires the GUC to be
// set in the same transaction as the writes (set_config(..., true) is local
// to the current transaction), which is why mutations always go through here.
export async function asActor<T>(
  userId: string,
  fn: (tx: Transaction) => Promise<T>
): Promise<T> {
  return getDb().transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('request.jwt.claim.sub', ${userId}, true)`);
    return fn(tx);
  });
}
