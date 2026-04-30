// api/echo.ts
// Diagnostic endpoint — no Hono, no adapter. Pure Vercel Node handler.
// Confirms whether POST body reading works at the Vercel runtime layer.
// DELETE THIS FILE ONCE THE BODY-HANG INVESTIGATION IS RESOLVED.

import type { IncomingMessage, ServerResponse } from 'node:http';

export default async function handler(req: IncomingMessage & { body?: unknown; rawBody?: unknown }, res: ServerResponse) {
  const start = Date.now();

  // Try to actually read the body via the Node stream, with a 5s timeout
  // so we can distinguish "stream hangs" from "stream returns nothing fast".
  let readMethod: string | null = null;
  let readBytes: number | null = null;
  let readMs: number | null = null;
  let readError: string | null = null;

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    try {
      readMethod = 'for-await';
      const chunks: Buffer[] = [];
      const readPromise = (async () => {
        for await (const chunk of req) {
          chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : (chunk as Buffer));
        }
        return Buffer.concat(chunks);
      })();
      const timeout = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('read-timed-out-after-5s')), 5000);
      });
      const buf = await Promise.race([readPromise, timeout]);
      readBytes = (buf as Buffer).length;
      readMs = Date.now() - start;
    } catch (e) {
      readError = (e as Error).message;
      readMs = Date.now() - start;
    }
  }

  const probe = {
    method: req.method,
    url: req.url,
    contentType: req.headers['content-type'] ?? null,
    contentLength: req.headers['content-length'] ?? null,
    hasBodyProp: 'body' in req,
    bodyType: typeof req.body,
    hasRawBodyProp: 'rawBody' in req,
    rawBodyIsBuffer: Buffer.isBuffer(req.rawBody),
    streamReadable: req.readable,
    streamReadableEnded: req.readableEnded,
    streamRead: { method: readMethod, bytes: readBytes, ms: readMs, error: readError },
  };

  res.statusCode = 200;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(probe, null, 2));
}
