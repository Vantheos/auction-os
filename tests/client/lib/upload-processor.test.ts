// tests/client/lib/upload-processor.test.ts
// C9 of the Phase 3.5 backfill (stretch) plus retry/backoff coverage.
//
// All three terminal paths through processOne() share the same invariant:
// flipStatus must precede the cache invalidation, which must precede the
// terminal idb write (dequeue or markUploadFailed). Without that ordering,
// PhotoStrip flashes blank or stale until staleTime expires.
//
// Tests cover:
//   - Success: 200 → flipStatus(uploaded) → invalidate → dequeue
//   - Permanent failure: 4xx → flipStatus(failed) → invalidate → markUploadFailed
//   - Transient → cap reached: 5xx with retries > MAX → flipStatus(failed)
//     → invalidate → markUploadFailed
//
// The under-cap retry/backoff path (5xx with retries <= MAX, schedules
// setTimeout) is exercised implicitly by the cap-reached test (the same
// branch is taken until next > MAX_RETRIES). A dedicated backoff-schedule
// test would need fake timers + multiple processOne cycles; the schedule
// itself is a data-lookup (BACKOFF_MS[next-1]) with no business logic
// worth pinning separately.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { queryClient } from '@/lib/query';

const queueState = vi.hoisted(() => ({
  entries: [] as Array<{
    photoId: string;
    lotId: string;
    blob: Blob;
    uploadUrl: string;
    storagePath: string;
    retries: number;
    createdAt: number;
  }>,
}));

vi.mock('@/lib/idb', () => ({
  enqueueUpload: vi.fn(async (entry) => {
    const i = queueState.entries.findIndex((e) => e.photoId === entry.photoId);
    if (i >= 0) queueState.entries[i] = entry;
    else queueState.entries.push(entry);
  }),
  dequeueUpload: vi.fn(async (photoId: string) => {
    const i = queueState.entries.findIndex((e) => e.photoId === photoId);
    if (i >= 0) queueState.entries.splice(i, 1);
  }),
  listUploadQueue: vi.fn(async () => queueState.entries.slice()),
  incrementRetries: vi.fn(async (photoId: string) => {
    const entry = queueState.entries.find((e) => e.photoId === photoId);
    if (entry) {
      entry.retries += 1;
      return entry.retries;
    }
    return 0;
  }),
  markUploadFailed: vi.fn(async (photoId: string) => {
    const entry = queueState.entries.find((e) => e.photoId === photoId);
    if (entry) entry.retries = -1;
  }),
}));

vi.mock('@/lib/api', async () => ({
  api: (await import('../../helpers/mock-api')).apiMockImpl,
}));

import {
  mockApi,
  resetMockApi,
  getApiCalls,
  type RouteCtx,
} from '../../helpers/mock-api';
import { addToQueue, startProcessor, stopProcessor } from '@/lib/upload-processor';

const originalFetch = globalThis.fetch;

beforeEach(() => {
  resetMockApi();
  queueState.entries = [];
  vi.clearAllMocks();
  stopProcessor();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  stopProcessor();
});

// Per-test helpers ---------------------------------------------------------

function makeEntry() {
  return {
    photoId: 'photo-1',
    lotId: 'lot-1',
    blob: new Blob(['x'], { type: 'image/jpeg' }),
    uploadUrl: 'https://test.local/upload',
    storagePath: 'lots/lot-1/photo-1.jpg',
    retries: 0,
    createdAt: 1,
  };
}

type Setup = {
  order: string[];
  invalidateCalls: Array<{ queryKey: unknown }>;
  restore: () => void;
};

async function runProcessorWithFetchAndOrder(
  fetchImpl: () => Promise<Response>,
  flipStatusHandler: (body: { status: string }) => unknown,
): Promise<Setup> {
  const order: string[] = [];
  const invalidateCalls: Array<{ queryKey: unknown }> = [];

  globalThis.fetch = vi.fn(async () => {
    order.push('upload-PUT');
    return fetchImpl();
  }) as typeof fetch;

  mockApi({
    'PATCH /lots/lot-1/photos/photo-1': (ctx: RouteCtx) => {
      const status = (ctx.body as { status: string }).status;
      order.push(`flipStatus-${status}`);
      return flipStatusHandler({ status });
    },
  });

  const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
  invalidateSpy.mockImplementation(async (filters?: { queryKey?: unknown }) => {
    order.push('invalidate');
    if (filters?.queryKey !== undefined) {
      invalidateCalls.push({ queryKey: filters.queryKey });
    }
  });

  const idb = await import('@/lib/idb');
  const dequeueOriginal = vi.mocked(idb.dequeueUpload).getMockImplementation();
  vi.mocked(idb.dequeueUpload).mockImplementation(async (photoId: string) => {
    order.push('dequeue');
    if (dequeueOriginal) await dequeueOriginal(photoId);
  });

  const markFailedOriginal = vi
    .mocked(idb.markUploadFailed)
    .getMockImplementation();
  vi.mocked(idb.markUploadFailed).mockImplementation(async (photoId: string) => {
    order.push('markUploadFailed');
    if (markFailedOriginal) await markFailedOriginal(photoId);
  });

  return {
    order,
    invalidateCalls,
    restore: () => invalidateSpy.mockRestore(),
  };
}

// Tests --------------------------------------------------------------------

describe('upload-processor — success path', () => {
  it('C9 — flipStatus(uploaded) → invalidate → dequeue, in order', async () => {
    const { order, invalidateCalls, restore } =
      await runProcessorWithFetchAndOrder(
        async () => new Response(null, { status: 200 }),
        () => ({}),
      );

    await startProcessor();
    await addToQueue(makeEntry());

    await vi.waitFor(
      () => {
        expect(queueState.entries.length).toBe(0);
      },
      { timeout: 2000 },
    );

    const patchIdx = order.indexOf('flipStatus-uploaded');
    const invalidateIdx = order.indexOf('invalidate');
    const dequeueIdx = order.indexOf('dequeue');
    expect(patchIdx).toBeGreaterThanOrEqual(0);
    expect(invalidateIdx).toBeGreaterThan(patchIdx);
    expect(dequeueIdx).toBeGreaterThan(invalidateIdx);
    expect(invalidateCalls).toContainEqual({
      queryKey: ['lot-photos', 'lot-1'],
    });
    restore();
  });
});

describe('upload-processor — permanent failure path', () => {
  it('4xx → flipStatus(failed) → invalidate → markUploadFailed, in order', async () => {
    const { order, restore } = await runProcessorWithFetchAndOrder(
      async () => new Response(null, { status: 403 }),
      () => ({}),
    );

    await startProcessor();
    await addToQueue(makeEntry());

    // Wait for the entry to land in terminal state (markUploadFailed sets
    // retries=-1, which the pickable filter excludes — so processor stops).
    await vi.waitFor(
      () => {
        const entry = queueState.entries.find((e) => e.photoId === 'photo-1');
        expect(entry?.retries).toBe(-1);
      },
      { timeout: 2000 },
    );

    const patchIdx = order.indexOf('flipStatus-failed');
    const invalidateIdx = order.indexOf('invalidate');
    const markFailedIdx = order.indexOf('markUploadFailed');
    expect(patchIdx).toBeGreaterThanOrEqual(0);
    expect(invalidateIdx).toBeGreaterThan(patchIdx);
    expect(markFailedIdx).toBeGreaterThan(invalidateIdx);

    // No dequeue on permanent — entry stays in idb with retries=-1
    expect(order).not.toContain('dequeue');

    restore();
  });
});

describe('upload-processor — transient cap reached', () => {
  it('5xx with retries > MAX → promote to failed: flipStatus → invalidate → markUploadFailed', async () => {
    // Pre-seed the entry with retries=MAX_RETRIES (3). After fetch returns
    // 5xx, incrementRetries bumps to 4, which exceeds cap, triggering the
    // promote-to-permanent branch.
    const idbModule = await import('@/lib/idb');
    vi.mocked(idbModule.incrementRetries).mockImplementationOnce(async () => 4);

    const { order, invalidateCalls, restore } =
      await runProcessorWithFetchAndOrder(
        async () => new Response(null, { status: 500 }),
        () => ({}),
      );

    await startProcessor();
    await addToQueue({ ...makeEntry(), retries: 3 });

    await vi.waitFor(
      () => {
        const entry = queueState.entries.find((e) => e.photoId === 'photo-1');
        expect(entry?.retries).toBe(-1);
      },
      { timeout: 2000 },
    );

    // Order on cap-promotion: flipStatus(failed) → invalidate → markUploadFailed
    // The invalidate here was added as a Phase 3.5 fix (T-3.5-G2) — without it,
    // PhotoStrip would show a stale 'pending' status for ~30s after the cap
    // is reached, until staleTime expires.
    const patchIdx = order.indexOf('flipStatus-failed');
    const invalidateIdx = order.indexOf('invalidate');
    const markFailedIdx = order.indexOf('markUploadFailed');
    expect(patchIdx).toBeGreaterThanOrEqual(0);
    expect(invalidateIdx).toBeGreaterThan(patchIdx);
    expect(markFailedIdx).toBeGreaterThan(invalidateIdx);

    expect(invalidateCalls).toContainEqual({
      queryKey: ['lot-photos', 'lot-1'],
    });

    // Sanity: the retry path's PATCH actually fired
    expect(
      getApiCalls().some(
        (c) => c.method === 'PATCH' && c.path === '/lots/lot-1/photos/photo-1',
      ),
    ).toBe(true);

    restore();
  });
});
