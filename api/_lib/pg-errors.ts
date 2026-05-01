// api/_lib/pg-errors.ts
// Shared helpers for translating Postgres SQLSTATE error codes into
// HTTP-appropriate API responses. The Drizzle wrapper places the original
// postgres-js error code on `err.cause.code`; some paths surface it on
// `err.code` directly. Always check both.

export const PG_UNIQUE_VIOLATION = '23505';
export const PG_FK_VIOLATION = '23503';

export function pgCodeOf(err: unknown): string | undefined {
  const e = err as { code?: string; cause?: { code?: string } };
  return e.code ?? e.cause?.code;
}
