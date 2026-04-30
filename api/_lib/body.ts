// api/_lib/body.ts
// Read POST/PATCH/DELETE bodies from the raw IncomingMessage stream.
// Vercel's Node Lambda runtime delivers POST bodies as a regular readable
// stream — it does NOT pre-parse them onto req.body or req.rawBody — so
// every handler that needs the body must consume it explicitly.

import type { IncomingMessage } from 'node:http';

const MAX_BODY_BYTES = 1 * 1024 * 1024; // 1 MiB cap for JSON requests

export async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = typeof chunk === 'string' ? Buffer.from(chunk) : (chunk as Buffer);
    total += buf.length;
    if (total > MAX_BODY_BYTES) {
      throw new BodyTooLargeError();
    }
    chunks.push(buf);
  }
  return Buffer.concat(chunks);
}

export async function readJson<T = unknown>(req: IncomingMessage): Promise<T> {
  const buf = await readBody(req);
  if (buf.length === 0) throw new EmptyBodyError();
  return JSON.parse(buf.toString('utf8')) as T;
}

export class EmptyBodyError extends Error {
  constructor() { super('Empty request body'); this.name = 'EmptyBodyError'; }
}

export class BodyTooLargeError extends Error {
  constructor() { super(`Request body exceeds ${MAX_BODY_BYTES} bytes`); this.name = 'BodyTooLargeError'; }
}
