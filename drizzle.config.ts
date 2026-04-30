import type { Config } from 'drizzle-kit';

export default {
  schema: './db/schema.ts',
  out: './supabase/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:54322/postgres',
  },
  // Generate timestamp-prefixed filenames Supabase expects
  breakpoints: true,
} satisfies Config;
