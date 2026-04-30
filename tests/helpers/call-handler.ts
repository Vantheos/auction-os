// tests/helpers/call-handler.ts
// Drives a native Vercel-style (req, res) handler with a mocked
// IncomingMessage / ServerResponse pair so tests can call handlers
// directly without a live HTTP server.

import { Readable } from 'node:stream';

export type CallOptions = {
  method: string;
  url?: string;
  headers?: Record<string, string>;
  body?: unknown;
};

export type CallResult<T = unknown> = {
  status: number;
  headers: Record<string, string | string[] | number>;
  body: T;
  text: string;
};

export async function callHandler<T = unknown>(
  handler: (req: any, res: any) => Promise<void> | void,
  opts: CallOptions
): Promise<CallResult<T>> {
  const bodyStr =
    opts.body === undefined
      ? ''
      : typeof opts.body === 'string'
        ? opts.body
        : JSON.stringify(opts.body);
  const bodyBuf = Buffer.from(bodyStr);

  const headers: Record<string, string> = { ...(opts.headers ?? {}) };
  // Normalize header keys to lowercase to match Node http behavior
  const lowerHeaders: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) lowerHeaders[k.toLowerCase()] = v;
  if (bodyBuf.length > 0 && !('content-length' in lowerHeaders)) {
    lowerHeaders['content-length'] = String(bodyBuf.length);
  }

  const req: any = bodyBuf.length > 0 ? Readable.from([bodyBuf]) : Readable.from([]);
  req.method = opts.method;
  req.url = opts.url ?? '/';
  req.headers = lowerHeaders;

  const chunks: Buffer[] = [];
  const resHeaders: Record<string, string | string[] | number> = {};
  const res: any = {
    statusCode: 200,
    setHeader(k: string, v: string | string[] | number) {
      resHeaders[k.toLowerCase()] = v;
    },
    getHeader(k: string) {
      return resHeaders[k.toLowerCase()];
    },
    write(chunk: Buffer | string) {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
      return true;
    },
    end(chunk?: Buffer | string) {
      if (chunk !== undefined) {
        chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
      }
    },
  };

  await handler(req, res);

  const text = Buffer.concat(chunks).toString('utf8');
  let body: any = text;
  try {
    body = text.length > 0 ? JSON.parse(text) : null;
  } catch {
    /* leave as text */
  }

  return { status: res.statusCode, headers: resHeaders, body: body as T, text };
}
