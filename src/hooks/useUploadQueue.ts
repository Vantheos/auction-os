// src/hooks/useUploadQueue.ts
// Subscribes to the module-level upload-processor singleton and exposes
// reactive state to React components. The processor itself is started
// once at app boot (see App.tsx); this hook is purely an observer.

import { useSyncExternalStore } from 'react';
import {
  subscribe,
  getSnapshot,
  retryEntry,
  discardEntry,
  addToQueue,
} from '@/lib/upload-processor';
import type { UploadQueueEntry } from '@/lib/idb';

export function useUploadQueue(): {
  pending: UploadQueueEntry[];
  pendingCount: number;
  perLotPending: (lotId: string) => UploadQueueEntry[];
  failedCount: number;
  retry: (photoId: string) => Promise<void>;
  discard: (photoId: string) => Promise<void>;
  enqueue: (entry: UploadQueueEntry) => Promise<void>;
} {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const pendingCount = snapshot.filter((e) => e.retries >= 0).length;
  const failedCount = snapshot.filter((e) => e.retries < 0).length;
  const perLotPending = (lotId: string) =>
    snapshot.filter((e) => e.lotId === lotId);

  return {
    pending: snapshot,
    pendingCount,
    perLotPending,
    failedCount,
    retry: retryEntry,
    discard: discardEntry,
    enqueue: addToQueue,
  };
}
