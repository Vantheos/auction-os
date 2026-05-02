// src/components/catalog/PhotoManager.tsx
// Full-screen photo viewer per option-c-flow.jsx → PhotoMgrScreen.
// Hero image + thumbnail strip + Retake / Move ← / Move → / Delete actions.
// Cover badge follows whichever photo is at display_order=1.
//
// Reorder writes via PATCH /api/lots/[id]/photos/order.
// Delete writes via DELETE /api/lots/[id]/photos/[photoId] which also
// re-shuffles display_order so the cover follows whoever is in slot 1.

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useLotPhotos } from '@/hooks/useLots';
import { usePhotoCapture } from '@/hooks/usePhotoCapture';
import { useCapturePhoto, useCatalogSession } from '@/hooks/useCatalogSession';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

type Props = {
  lotId: string;
  initialFocusId?: string | null;
  onClose: () => void;
};

export function PhotoManager({ lotId, initialFocusId, onClose }: Props) {
  const queryClient = useQueryClient();
  const session = useCatalogSession();
  const photosQ = useLotPhotos(lotId);
  const photos = useMemo(() => (photosQ.data ?? []).slice().sort((a, b) => a.displayOrder - b.displayOrder), [photosQ.data]);

  const [focusIdx, setFocusIdx] = useState(0);
  const [confirmCascade, setConfirmCascade] = useState(false);
  useEffect(() => {
    if (initialFocusId && photos.length > 0) {
      const idx = photos.findIndex((p) => p.id === initialFocusId);
      if (idx >= 0) setFocusIdx(idx);
    }
  }, [initialFocusId, photos]);

  const reorder = useMutation({
    mutationFn: async (order: string[]) =>
      api(`/lots/${lotId}/photos/order`, { method: 'PATCH', body: JSON.stringify({ order }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['lot-photos', lotId] }),
  });

  const remove = useMutation({
    mutationFn: async (photoId: string) =>
      api(`/lots/${lotId}/photos/${photoId}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['lot-photos', lotId] }),
  });

  const capturePhoto = useCapturePhoto(lotId);
  const { openCamera, inputRef, onChange: onCameraChange } = usePhotoCapture(async (blob) => {
    await capturePhoto.mutateAsync(blob);
  });

  const isCascading = session.lotId === lotId;

  if (photos.length === 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-text text-white p-6 gap-4">
        <div className="text-lg">No photos yet</div>
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 rounded-md border border-white/20 hover:bg-white/5"
        >
          Back to lot
        </button>
      </div>
    );
  }

  const focused = photos[Math.min(focusIdx, photos.length - 1)];
  const isFirst = focusIdx === 0;
  const isLast = focusIdx === photos.length - 1;

  const swap = async (i: number, j: number) => {
    if (i < 0 || j < 0 || i >= photos.length || j >= photos.length) return;
    const next = [...photos];
    [next[i], next[j]] = [next[j], next[i]];
    await reorder.mutateAsync(next.map((p) => p.id));
    setFocusIdx(j);
  };

  const del = async () => {
    // Cataloging-source lots must always have ≥1 photo per the deferrable
    // trigger in migration 0008. Deleting the last photo would fail the
    // constraint, so we surface a confirm dialog and cascade to lot delete.
    if (photos.length === 1) {
      setConfirmCascade(true);
      return;
    }
    const idx = focusIdx;
    await remove.mutateAsync(focused.id);
    setFocusIdx(Math.max(0, idx - 1));
  };

  const confirmDeleteLot = async () => {
    if (isCascading) {
      // The lot being deleted IS the in-progress session lot. Use the
      // session's discard path so the session state resets atomically
      // (clears form mirror, advances to fresh lot, etc.) and closes
      // the photo manager.
      await session.discardCurrent();
      onClose();
    } else {
      // Fallback: delete the lot directly. (PhotoManager is currently
      // only reachable from the active cataloging session, but this is
      // safe if that ever changes.)
      await api(`/lots/${lotId}`, { method: 'DELETE' });
      queryClient.invalidateQueries({ queryKey: ['lots-infinite'] });
      onClose();
    }
    setConfirmCascade(false);
  };

  return (
    <div className="min-h-screen flex flex-col bg-text text-white">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={onCameraChange}
        style={{ display: 'none' }}
      />

      {/* Top bar */}
      <div className="px-4 py-3 flex items-center gap-3">
        <button type="button" onClick={onClose} className="text-white text-lg" aria-label="Close">×</button>
        <div className="text-sm font-semibold flex-1">Photo {focusIdx + 1} of {photos.length}</div>
        {focusIdx === 0 && (
          <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-brand text-white font-bold">
            Cover
          </span>
        )}
      </div>

      {/* Hero with arrow controls */}
      <div className="flex-1 flex items-center justify-center px-6 py-4 relative">
        <div className="w-full max-w-md aspect-[4/3] rounded-md overflow-hidden bg-text/30">
          {focused.signedUrl ? (
            <img src={focused.signedUrl} alt={`Photo ${focusIdx + 1}`} className="size-full object-contain" />
          ) : focused.status === 'pending' ? (
            <div className="size-full flex items-center justify-center text-white/60">Uploading…</div>
          ) : focused.status === 'failed' ? (
            <div className="size-full flex items-center justify-center text-white/60">Upload failed</div>
          ) : (
            <div className="size-full flex items-center justify-center text-white/60">No image</div>
          )}
        </div>
        {!isFirst && (
          <button
            type="button"
            onClick={() => setFocusIdx(focusIdx - 1)}
            className="absolute left-4 top-1/2 -translate-y-1/2 size-9 rounded-full bg-white/15 hover:bg-white/25 backdrop-blur"
            aria-label="Previous"
          >‹</button>
        )}
        {!isLast && (
          <button
            type="button"
            onClick={() => setFocusIdx(focusIdx + 1)}
            className="absolute right-4 top-1/2 -translate-y-1/2 size-9 rounded-full bg-white/15 hover:bg-white/25 backdrop-blur"
            aria-label="Next"
          >›</button>
        )}
      </div>

      {/* Thumbnail strip */}
      <div className="px-4 pb-3 flex gap-1.5 overflow-x-auto">
        {photos.map((p, i) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setFocusIdx(i)}
            className={`size-14 flex-shrink-0 rounded overflow-hidden border-2 ${
              i === focusIdx ? 'border-brand' : 'border-white/15'
            }`}
          >
            {p.signedUrl ? (
              <img src={p.signedUrl} alt="" className="size-full object-cover" />
            ) : (
              <div className="size-full bg-white/10" />
            )}
          </button>
        ))}
      </div>

      {/* Actions */}
      <div className="p-3 border-t border-white/10 grid grid-cols-4 gap-2">
        <ActionButton label="Retake" onClick={openCamera} disabled={capturePhoto.isPending} />
        <ActionButton label="← Move" onClick={() => swap(focusIdx, focusIdx - 1)} disabled={isFirst || reorder.isPending} />
        <ActionButton label="Move →" onClick={() => swap(focusIdx, focusIdx + 1)} disabled={isLast || reorder.isPending} />
        <ActionButton label="Delete" onClick={del} disabled={remove.isPending} variant="danger" />
      </div>

      {/* Last-photo cascade confirm. The DB trigger would reject the photo
          delete on a cataloging-source lot if it would leave zero photos;
          surfacing this dialog is the user-facing equivalent. */}
      <Dialog open={confirmCascade} onOpenChange={(o) => !o && setConfirmCascade(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete the last photo?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-textDim">
            A lot must always have at least one photo. Deleting this photo will also delete the entire lot. This cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmCascade(false)}>Cancel</Button>
            <Button variant="destructive" onClick={confirmDeleteLot}>Delete photo & lot</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ActionButton({ label, onClick, disabled, variant }: {
  label: string; onClick: () => void; disabled?: boolean; variant?: 'danger';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`h-12 rounded-md border border-white/15 bg-white/5 text-xs font-medium flex items-center justify-center disabled:opacity-40 ${
        variant === 'danger' ? 'text-state-not-sellable' : 'text-white'
      }`}
    >
      {label}
    </button>
  );
}
