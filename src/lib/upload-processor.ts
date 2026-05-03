// src/lib/upload-processor.ts
// Module-level singleton processor for the photo upload queue. Runs
// independently of any component lifecycle so that mount/unmount of the
// catalog screens doesn't restart the queue. Hook (useUploadQueue.ts)
// subscribes to its observable state.
//
// Concurrency: up to 3 in-flight uploads at a time. Pause when total
// pending exceeds 20 (configurable). Exponential backoff on retry
// (1s, 4s, 16s).

import {
  enqueueUpload,
  dequeueUpload,
  listUploadQueue,
  incrementRetries,
  markUploadFailed,
  type UploadQueueEntry,
} from './idb';
import { api } from './api';
import { queryClient } from './query';

const MAX_CONCURRENT = 3;
const PAUSE_THRESHOLD = 20;
const MAX_RETRIES = 3;
const BACKOFF_MS = [1_000, 4_000, 16_000];

type Listener = () => void;

const inFlight = new Set<string>();
const scheduled = new Set<string>();
const listeners = new Set<Listener>();
let started = false;
let snapshot: UploadQueueEntry[] = [];

function notify() {
  for (const l of listeners) {
    try { l(); } catch (e) { console.error('upload-processor listener error', e); }
  }
}

async function refreshSnapshot() {
  snapshot = await listUploadQueue();
  notify();
}

async function flipStatus(photoId: string, lotId: string, status: 'uploaded' | 'failed') {
  try {
    await api(`/lots/${lotId}/photos/${photoId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error(`upload-processor: failed to flip status for ${photoId}: ${String(e)}`);
  }
}

async function attemptUpload(entry: UploadQueueEntry): Promise<'success' | 'transient' | 'permanent'> {
  try {
    const r = await fetch(entry.uploadUrl, {
      method: 'PUT',
      body: entry.blob,
      headers: { 'Content-Type': entry.blob.type || 'image/jpeg' },
    });
    if (r.ok) return 'success';
    // 4xx → permanent (signed URL expired, RLS blocked, etc)
    if (r.status >= 400 && r.status < 500) return 'permanent';
    return 'transient';
  } catch {
    // Network error → transient (retry)
    return 'transient';
  }
}

async function processOne(entry: UploadQueueEntry): Promise<void> {
  if (inFlight.has(entry.photoId)) return;
  inFlight.add(entry.photoId);

  try {
    const result = await attemptUpload(entry);
    if (result === 'success') {
      await flipStatus(entry.photoId, entry.lotId, 'uploaded');
      // Refetch the photos query before dequeuing so the new signedUrl is in
      // cache before the blob URL is removed. Without this, PhotoStrip flashes
      // blank for ~30s (until staleTime expires + an ambient render triggers
      // refetch). invalidateQueries awaits the refetch.
      await queryClient.invalidateQueries({ queryKey: ['lot-photos', entry.lotId] });
      await dequeueUpload(entry.photoId);
    } else if (result === 'permanent') {
      await flipStatus(entry.photoId, entry.lotId, 'failed');
      // Surface the failed status immediately rather than waiting for
      // staleTime to expire.
      await queryClient.invalidateQueries({ queryKey: ['lot-photos', entry.lotId] });
      await markUploadFailed(entry.photoId);
    } else {
      // Transient failure — retry with backoff
      const next = await incrementRetries(entry.photoId);
      if (next === -1 || next > MAX_RETRIES) {
        await flipStatus(entry.photoId, entry.lotId, 'failed');
        // Invalidate before terminal write so PhotoStrip reflects the
        // failed status without waiting for staleTime to expire — same
        // contract as the success and permanent-failure paths above.
        await queryClient.invalidateQueries({ queryKey: ['lot-photos', entry.lotId] });
        await markUploadFailed(entry.photoId);
      } else {
        const delay = BACKOFF_MS[Math.min(next - 1, BACKOFF_MS.length - 1)];
        scheduled.add(entry.photoId);
        setTimeout(() => {
          scheduled.delete(entry.photoId);
          tick();
        }, delay);
      }
    }
  } finally {
    inFlight.delete(entry.photoId);
    await refreshSnapshot();
    // Try to fill any newly-available slot
    tick();
  }
}

async function tick() {
  if (!started) return;
  await refreshSnapshot();
  // Pause if there's a backlog beyond threshold; new captures should slow down
  // (the UI surfaces this via PendingUploadsIndicator).
  if (snapshot.length > PAUSE_THRESHOLD) return;

  // Pickable: not currently in flight, not scheduled for retry, not terminal failure
  const pickable = snapshot.filter((e) =>
    !inFlight.has(e.photoId) && !scheduled.has(e.photoId) && e.retries >= 0 && e.retries <= MAX_RETRIES
  );
  const slots = MAX_CONCURRENT - inFlight.size;
  for (const entry of pickable.slice(0, slots)) {
    void processOne(entry);
  }
}

export async function startProcessor(): Promise<void> {
  if (started) return;
  started = true;
  await refreshSnapshot();
  void tick();
}

export function stopProcessor(): void {
  started = false;
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSnapshot(): UploadQueueEntry[] {
  return snapshot;
}

/**
 * Add a fresh entry and kick the processor.
 */
export async function addToQueue(entry: UploadQueueEntry): Promise<void> {
  await enqueueUpload(entry);
  await refreshSnapshot();
  void tick();
}

/**
 * Reset a terminal-failure entry back to retries=0 so the user can retry it.
 */
export async function retryEntry(photoId: string): Promise<void> {
  const entry = snapshot.find((e) => e.photoId === photoId);
  if (!entry) return;
  await enqueueUpload({ ...entry, retries: 0 });
  await refreshSnapshot();
  void tick();
}

/**
 * Discard a terminal-failure entry without retrying. Caller is responsible
 * for separately deleting the lot_photo row + storage object via the API.
 */
export async function discardEntry(photoId: string): Promise<void> {
  await dequeueUpload(photoId);
  await refreshSnapshot();
}
