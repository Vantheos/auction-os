// api/_lib/db.ts
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../../db/schema.js';

let _client: ReturnType<typeof postgres> | null = null;

export function getDb() {
  if (!_client) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL not set');
    _client = postgres(url, { prepare: false, max: 1 });
  }
  return drizzle(_client, { schema });
}
