// tests/api/cron-cleanup-export-blobs.test.ts
// Phase 5 Area 5 — daily cron that deletes Vercel Blob objects under the
// `exports/` prefix older than 24h. Cron auth gate + correct age filter.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { callHandler } from '../helpers/call-handler';

const NOW = Date.parse('2026-05-04T12:00:00.000Z');
const TWENTY_FIVE_HOURS_AGO = new Date(NOW - 25 * 60 * 60 * 1000);
const TWENTY_HOURS_AGO = new Date(NOW - 20 * 60 * 60 * 1000);

// Capture deletes via mock — verify which URLs got deleted.
const deletedUrls: string[] = [];

vi.mock('@vercel/blob', () => ({
  list: vi.fn(async () => ({
    blobs: [
      { url: 'https://blob.example.com/exports/job-1/old-1.zip', uploadedAt: TWENTY_FIVE_HOURS_AGO },
      { url: 'https://blob.example.com/exports/job-1/old-2.zip', uploadedAt: TWENTY_FIVE_HOURS_AGO },
      { url: 'https://blob.example.com/exports/job-2/recent.zip', uploadedAt: TWENTY_HOURS_AGO },
    ],
    cursor: undefined,
  })),
  del: vi.fn(async (url: string) => {
    deletedUrls.push(url);
  }),
}));

const { default: handler } = await import('../../api/cron/cleanup-export-blobs');

beforeEach(() => {
  deletedUrls.length = 0;
  vi.useFakeTimers();
  vi.setSystemTime(new Date(NOW));
});

afterEach(() => {
  vi.useRealTimers();
});

const SECRET = process.env.CRON_SECRET ?? 'test-cron-secret';

describe('GET/POST /api/cron/cleanup-export-blobs', () => {
  it('deletes blobs older than 24h, leaves recent ones alone', async () => {
    const res = await callHandler<any>(handler, {
      method: 'POST',
      url: '/api/cron/cleanup-export-blobs',
      headers: { Authorization: `Bearer ${SECRET}` },
      body: undefined,
    });
    expect(res.status).toBe(200);
    expect(res.body.scanned).toBe(3);
    expect(res.body.deleted).toBe(2);
    expect(res.body.errors).toBe(0);
    expect(deletedUrls).toEqual([
      'https://blob.example.com/exports/job-1/old-1.zip',
      'https://blob.example.com/exports/job-1/old-2.zip',
    ]);
  });

  it('rejects missing auth', async () => {
    const res = await callHandler<any>(handler, {
      method: 'POST',
      url: '/api/cron/cleanup-export-blobs',
      headers: {},
      body: undefined,
    });
    expect(res.status).toBe(401);
  });

  it('rejects wrong cron token', async () => {
    const res = await callHandler<any>(handler, {
      method: 'POST',
      url: '/api/cron/cleanup-export-blobs',
      headers: { Authorization: 'Bearer wrong-token' },
      body: undefined,
    });
    expect(res.status).toBe(401);
  });

  it('rejects wrong method', async () => {
    const res = await callHandler<any>(handler, {
      method: 'PUT',
      url: '/api/cron/cleanup-export-blobs',
      headers: { Authorization: `Bearer ${SECRET}` },
      body: undefined,
    });
    expect(res.status).toBe(405);
  });
});

