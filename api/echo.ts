// api/echo.ts
// Diagnostic endpoint — no Hono, no adapter. Pure Vercel Node handler.
// Confirms whether POST body reading works at the Vercel runtime layer.
// DELETE THIS FILE ONCE THE BODY-HANG INVESTIGATION IS RESOLVED.

import type { IncomingMessage, ServerResponse } from 'node:http';

export default async function handler(req: IncomingMessage & { body?: unknown; rawBody?: unknown }, res: ServerResponse) {
  const probe = {
    method: req.method,
    url: req.url,
    contentType: req.headers['content-type'] ?? null,
    contentLength: req.headers['content-length'] ?? null,
    hasBodyProp: 'body' in req,
    bodyType: typeof req.body,
    bodyValue: req.body === undefined ? null : (typeof req.body === 'object' ? req.body : String(req.body).slice(0, 200)),
    hasRawBodyProp: 'rawBody' in req,
    rawBodyType: typeof req.rawBody,
    rawBodyIsBuffer: Buffer.isBuffer(req.rawBody),
    rawBodyLength: Buffer.isBuffer(req.rawBody) ? req.rawBody.length : (typeof req.rawBody === 'string' ? (req.rawBody as string).length : null),
    streamReadable: req.readable,
    streamReadableEnded: req.readableEnded,
  };

  res.statusCode = 200;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(probe, null, 2));
}
