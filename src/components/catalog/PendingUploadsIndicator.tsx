// src/components/catalog/PendingUploadsIndicator.tsx
// Status pill showing pending and failed upload counts. The "failed" pill
// is clickable: it opens a popover listing each terminal-failure entry
// with Retry and Discard actions so the operator can recover without
// developer intervention. Discard removes the IDB queue entry AND best-
// effort deletes the orphan lot_photo row server-side; failures there
// are non-fatal — the queue is the operator-visible state.

import { useEffect, useRef, useState } from 'react';
import { useUploadQueue } from '@/hooks/useUploadQueue';
import { api } from '@/lib/api';
import { useToast } from '@/components/ui/toast';
import type { UploadQueueEntry } from '@/lib/idb';

export function PendingUploadsIndicator() {
  const { pending, pendingCount, failedCount, retry, discard } = useUploadQueue();
  const [open, setOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const { toast } = useToast();

  // Close on outside click. Tracks pointerdown rather than click so the
  // popover collapses crisply without the body click intercepting.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!popoverRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  if (pendingCount === 0 && failedCount === 0) return null;

  const failed = pending.filter((e) => e.retries < 0);
  // Visual gate so the popover unmounts the instant the queue clears the
  // last failed entry — no effect needed. Action handlers also close
  // explicitly so a stale `open` state can't auto-resurface the popover
  // when a new failure arrives later.
  const popoverOpen = open && failedCount > 0;

  const handleRetry = async (entry: UploadQueueEntry) => {
    if (failed.length <= 1) setOpen(false);
    try {
      await retry(entry.photoId);
    } catch (err) {
      toast({
        title: 'Retry failed',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'danger',
      });
    }
  };

  const handleDiscard = async (entry: UploadQueueEntry) => {
    if (failed.length <= 1) setOpen(false);
    // Remove the IDB queue entry first so the operator sees the indicator
    // update immediately. Then best-effort cleanup of the orphan
    // lot_photo row server-side. If the server delete fails (offline,
    // photo already gone), the operator still has a clean local state —
    // the orphan row is harmless and can be reaped separately.
    try {
      await discard(entry.photoId);
    } catch (err) {
      toast({
        title: 'Could not discard locally',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'danger',
      });
      return;
    }
    try {
      await api(`/lots/${entry.lotId}/photos/${entry.photoId}`, { method: 'DELETE' });
    } catch {
      // Non-fatal; surface the partial result so the operator knows.
      toast({
        title: 'Photo discarded locally',
        description: 'Server cleanup failed — the empty photo slot may need manual cleanup later.',
        variant: 'warning',
      });
    }
  };

  return (
    <div className="relative inline-flex items-center gap-2 text-xs" ref={popoverRef}>
      {pendingCount > 0 && (
        <span className="inline-flex items-center gap-1.5 rounded-md bg-info-bg text-brand px-2 py-1 font-medium">
          <span className="size-1.5 rounded-full bg-brand animate-pulse" />
          {pendingCount} uploading
        </span>
      )}
      {failedCount > 0 && (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-haspopup="dialog"
          className="inline-flex items-center gap-1.5 rounded-md bg-state-not-sellable-bg text-state-not-sellable px-2 py-1 font-medium hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-state-not-sellable focus:ring-offset-1"
        >
          <span className="size-1.5 rounded-full bg-state-not-sellable" />
          {failedCount} failed
        </button>
      )}
      {popoverOpen && (
        <div
          role="dialog"
          aria-label="Failed uploads"
          className="absolute left-0 top-full mt-1 z-20 w-72 max-h-80 overflow-y-auto rounded-md border border-border bg-surfaceSolid shadow-lg p-2 space-y-1.5"
        >
          <div className="text-[11px] uppercase tracking-wide font-semibold text-textDim px-1 pb-1">
            Failed uploads
          </div>
          {failed.map((entry) => (
            <div
              key={entry.photoId}
              className="flex items-center gap-2 p-1.5 rounded border border-border bg-surface"
              data-testid={`failed-upload-${entry.photoId}`}
            >
              <div className="flex-1 min-w-0 text-[11px] text-text">
                <div className="font-mono text-textDim truncate">{entry.photoId.slice(0, 8)}…</div>
                <div className="text-textFaint">{Math.round(entry.blob.size / 1024)} KB</div>
              </div>
              <button
                type="button"
                onClick={() => handleRetry(entry)}
                className="text-[11px] px-2 py-1 rounded border border-brand text-brand hover:bg-info-bg font-medium"
              >
                Retry
              </button>
              <button
                type="button"
                onClick={() => handleDiscard(entry)}
                className="text-[11px] px-2 py-1 rounded border border-state-not-sellable text-state-not-sellable hover:bg-state-not-sellable-bg font-medium"
              >
                Discard
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
