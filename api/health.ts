// api/health.ts
import type { IncomingMessage, ServerResponse } from 'node:http';
import { jsonOk, methodNotAllowed } from './_lib/responses.js';

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== 'GET') return methodNotAllowed(res);
  return jsonOk(res, { ok: true, ts: new Date().toISOString() });
}
