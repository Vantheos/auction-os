// src/components/catalog/PendingUploadsIndicator.tsx
// Small persistent status pill showing pending and failed counts. Visible
// in the cataloging shell so the operator knows when uploads are flowing
// vs. when something is stuck.

import { useUploadQueue } from '@/hooks/useUploadQueue';

export function PendingUploadsIndicator() {
  const { pendingCount, failedCount } = useUploadQueue();
  if (pendingCount === 0 && failedCount === 0) return null;

  return (
    <div className="inline-flex items-center gap-2 text-xs">
      {pendingCount > 0 && (
        <span className="inline-flex items-center gap-1.5 rounded-md bg-info-bg text-brand px-2 py-1 font-medium">
          <span className="size-1.5 rounded-full bg-brand animate-pulse" />
          {pendingCount} uploading
        </span>
      )}
      {failedCount > 0 && (
        <span className="inline-flex items-center gap-1.5 rounded-md bg-state-not-sellable-bg text-state-not-sellable px-2 py-1 font-medium">
          <span className="size-1.5 rounded-full bg-state-not-sellable" />
          {failedCount} failed
        </span>
      )}
    </div>
  );
}
