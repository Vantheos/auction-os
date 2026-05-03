// tests/client/lib/upload-processor.test.ts
// C9 of the Phase 3.5 backfill (stretch).
//
// After a successful PUT to the signed upload URL, the processor must:
//   1. PATCH /lots/:id/photos/:photoId with { status: 'uploaded' } (flipStatus)
//   2. AWAIT invalidateQueries(['lot-photos', lotId]) — refetches the photo
//      list so the new signedUrl is in cache before the blob URL is removed
//   3. dequeueUpload(photoId) — removes the blob from idb
//
// If step 3 runs before step 2 completes, PhotoStrip flashes blank for ~30s
// (until staleTime expires + an ambient render triggers refetch). That was
// the Phase 3 thumbnail-flicker bug.
//
// The processor is a module-level singleton with side-effecting fetch and
// idb calls. We mock the idb module + global fetch and spy on queryClient's
// invalidateQueries to assert call ORDER. The idb mocks must mutate a
// shared queue array so the processor sees an empty queue after dequeue —
// otherwise tick() loops on the same entry forever.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { queryClient } from '@/lib/query';

// Shared mutable queue state — declared via vi.hoisted so the vi.mock factory
// (which is hoisted to the top of the file) can close over the same binding
// the test body mutates.
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
  incrementRetries: vi.fn(async () => 1),
  markUploadFailed: vi.fn(async () => {}),
}));

vi.mock('@/lib/api', async () => ({
  api: (await import('../../helpers/mock-api')).apiMockImpl,
}));

import { mockApi, resetMockApi, getApiCalls } from '../../helpers/mock-api';
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

describe('upload-processor — invalidation timing', () => {
  it('C9 — invalidateQueries runs AFTER flipStatus and BEFORE dequeueUpload', async () => {
    const order: string[] = [];

    globalThis.fetch = vi.fn(async () => {
      order.push('upload-PUT');
      return new Response(null, { status: 200 });
    }) as typeof fetch;

    mockApi({
      'PATCH /lots/lot-1/photos/photo-1': () => {
        order.push('flipStatus-PATCH');
        return {};
      },
    });

    const invalidateSpy = vi
      .spyOn(queryClient, 'invalidateQueries')
      .mockImplementation(async () => {
        order.push('invalidate');
      });

    // Track dequeue ordering by wrapping the (already-mocked) idb.dequeueUpload
    const idb = await import('@/lib/idb');
    const dequeueOriginal = vi.mocked(idb.dequeueUpload).getMockImplementation();
    vi.mocked(idb.dequeueUpload).mockImplementation(async (photoId: string) => {
      order.push('dequeue');
      if (dequeueOriginal) await dequeueOriginal(photoId);
    });

    const entry = {
      photoId: 'photo-1',
      lotId: 'lot-1',
      blob: new Blob(['x'], { type: 'image/jpeg' }),
      uploadUrl: 'https://test.local/upload',
      storagePath: 'lots/lot-1/photo-1.jpg',
      retries: 0,
      createdAt: 1,
    };

    await startProcessor();
    await addToQueue(entry);

    await vi.waitFor(
      () => {
        expect(queueState.entries.length).toBe(0);
      },
      { timeout: 2000 },
    );

    const patchIdx = order.indexOf('flipStatus-PATCH');
    const invalidateIdx = order.indexOf('invalidate');
    const dequeueIdx = order.indexOf('dequeue');

    expect(patchIdx).toBeGreaterThanOrEqual(0);
    expect(invalidateIdx).toBeGreaterThanOrEqual(0);
    expect(dequeueIdx).toBeGreaterThanOrEqual(0);
    expect(invalidateIdx).toBeGreaterThan(patchIdx);
    expect(dequeueIdx).toBeGreaterThan(invalidateIdx);

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['lot-photos', 'lot-1'],
    });

    invalidateSpy.mockRestore();

    expect(
      getApiCalls().some(
        (c) =>
          c.method === 'PATCH' && c.path === '/lots/lot-1/photos/photo-1',
      ),
    ).toBe(true);
  });
});
