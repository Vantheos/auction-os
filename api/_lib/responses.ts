// api/_lib/responses.ts
// JSON response helpers for native (req, res) Vercel handlers.

import type { ServerResponse } from 'node:http';

export function jsonOk(res: ServerResponse, body: unknown, status = 200) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

export function jsonError(res: ServerResponse, status: number, code: string, message: string) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify({ error: { code, message } }));
}

export function methodNotAllowed(res: ServerResponse) {
  return jsonError(res, 405, 'METHOD_NOT_ALLOWED', 'Method not allowed');
}
