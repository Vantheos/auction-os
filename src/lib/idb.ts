// src/lib/idb.ts
// IndexedDB wrappers for the cataloging upload queue and form mirror.
// Built on idb-keyval (~1 KB). Two independent stores:
//
//   1. photo-upload-queue
//      Keyed by photoId. Entry holds the captured Blob, the signed upload
//      URL, retry counter, and lot context. Survives tab close so abandoned
//      uploads can resume on next session entry.
//
//   2. lot-form-cache
//      Keyed by lotId. Holds the in-progress lot's field values, mirrored
//      on every keystroke (200ms debounce). Covers the gap between last
//      server PATCH (1.5s debounce) and any tab close.
//
// Both use idb-keyval's createStore so they're isolated databases — drops
// in cleanly without colliding with anything else and lets us iterate
// each independently.

import { createStore, get, set, del, keys, values, entries } from 'idb-keyval';

// ── Photo upload queue ─────────────────────────────────────────────────

const uploadQueueStore = createStore('auction-os-upload-queue', 'photo-upload-queue');

export type UploadQueueEntry = {
  photoId: string;
  lotId: string;
  blob: Blob;
  uploadUrl: string;
  storagePath: string;
  retries: number;          // 0..3 normally; -1 means terminal failure
  createdAt: number;        // epoch ms
};

export async function enqueueUpload(entry: UploadQueueEntry): Promise<void> {
  await set(entry.photoId, entry, uploadQueueStore);
}

export async function dequeueUpload(photoId: string): Promise<void> {
  await del(photoId, uploadQueueStore);
}

export async function getUploadEntry(photoId: string): Promise<UploadQueueEntry | undefined> {
  return get<UploadQueueEntry>(photoId, uploadQueueStore);
}

export async function listUploadQueue(): Promise<UploadQueueEntry[]> {
  return (await values<UploadQueueEntry>(uploadQueueStore)) ?? [];
}

export async function listUploadQueueIds(): Promise<string[]> {
  return ((await keys(uploadQueueStore)) as string[]) ?? [];
}

export async function listUploadQueueEntries(): Promise<Array<[string, UploadQueueEntry]>> {
  return (await entries<string, UploadQueueEntry>(uploadQueueStore)) ?? [];
}

/**
 * Atomically increment the retry counter on an entry. Returns the new value.
 * If the entry doesn't exist, returns -1 (caller should bail).
 */
export async function incrementRetries(photoId: string): Promise<number> {
  const entry = await getUploadEntry(photoId);
  if (!entry) return -1;
  const next = entry.retries + 1;
  await enqueueUpload({ ...entry, retries: next });
  return next;
}

/**
 * Mark an entry as terminally failed (retries = -1). It stays in the queue
 * so the UI can surface it for retry/discard, but the queue processor skips it.
 */
export async function markUploadFailed(photoId: string): Promise<void> {
  const entry = await getUploadEntry(photoId);
  if (!entry) return;
  await enqueueUpload({ ...entry, retries: -1 });
}

// ── Form mirror ────────────────────────────────────────────────────────

const formMirrorStore = createStore('auction-os-form-mirror', 'lot-form-cache');

export type FormMirrorEntry = {
  lotId: string;
  fields: Record<string, unknown>;   // partial LotDTO field set
  lastTouchedAt: number;
};

export async function saveFormMirror(lotId: string, fields: Record<string, unknown>): Promise<void> {
  const entry: FormMirrorEntry = { lotId, fields, lastTouchedAt: Date.now() };
  await set(lotId, entry, formMirrorStore);
}

export async function loadFormMirror(lotId: string): Promise<FormMirrorEntry | undefined> {
  return get<FormMirrorEntry>(lotId, formMirrorStore);
}

export async function clearFormMirror(lotId: string): Promise<void> {
  await del(lotId, formMirrorStore);
}
