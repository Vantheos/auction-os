import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

// Single shared client; postgres-js handles pooling internally
const queryClient = postgres(url, { prepare: false });
export const db = drizzle(queryClient, { schema });

export type DB = typeof db;
