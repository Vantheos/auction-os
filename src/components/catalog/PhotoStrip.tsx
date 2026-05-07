// src/components/catalog/PhotoStrip.tsx
// Thumbnail strip for the lot-in-progress screen and the lot detail
// modal. Renders captured photos (server rows + queue entries with local
// blob URLs for not-yet-uploaded captures), plus a "+" tile to add more
// (max 12 per spec §6.1).
//
// Tap a thumbnail → opens the full-screen Photo Manager.
//
// Layout: fixed-size thumbnails with horizontal scroll. Arrow buttons
// appear at the edges when content overflows the visible area; mobile
// users can swipe natively. This keeps thumbnails legible regardless of
// photo count (12 max) and viewport.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useUploadQueue } from '@/hooks/useUploadQueue';
import { useLotPhotos } from '@/hooks/useLots';

const MAX_PHOTOS = 12;
// Each thumbnail: 80px (w-20). Scroll on overflow.
const THUMB_PX = 80;
// Click-arrow scroll delta — three thumbnails plus their gap (1.5 = 6px).
const ARROW_SCROLL_DELTA = THUMB_PX * 3 + 6 * 3;

type CombinedPhoto = {
  id: string;
  displayOrder: number;
  status: 'pending' | 'uploaded' | 'failed';
  src: string | null;       // signed URL from server, or local blob URL
};

export function PhotoStrip({ lotId, onCapture, capturing, onTapThumb }: {
  lotId: string | null;
  onCapture: () => void;
  capturing?: boolean;
  // Required. Parent owns the photo-manager invocation: cataloging session
  // and lot detail both render PhotoManager inline via local state. There
  // is no longer a route-based fallback — every caller passes a callback.
  onTapThumb: (photoId: string) => void;
}) {
  const photosQ = useLotPhotos(lotId ?? undefined);
  const { pending } = useUploadQueue();

  // Build combined photo list: server-known photos + queue entries that
  // don't yet have a server status of 'uploaded'. The queue entry's local
  // blob URL is rendered immediately for snappy UX even before upload.
  // Memoize so downstream useMemo doesn't recompute on every render.
  const queueEntries = useMemo(
    () => (lotId ? pending.filter((e) => e.lotId === lotId) : []),
    [lotId, pending]
  );
  const queueBlobs = useMemo(() => queueEntries.map((e) => e.blob), [queueEntries]);
  const blobUrls = useBlobUrls(queueBlobs);

  const combined: CombinedPhoto[] = useMemo(() => {
    const out: CombinedPhoto[] = [];
    const queueIds = new Set(queueEntries.map((e) => e.photoId));
    // Server photos first; if also in queue (still uploading), prefer server's status.
    for (const p of photosQ.data ?? []) {
      const inQueue = queueIds.has(p.id);
      out.push({
        id: p.id,
        displayOrder: p.displayOrder,
        status: p.status,
        src: p.signedUrl ?? (inQueue ? blobUrlFor(queueEntries, blobUrls, p.id) : null),
      });
    }
    // Queue-only entries (server hasn't surfaced them yet from a refetch)
    const serverIds = new Set((photosQ.data ?? []).map((p) => p.id));
    for (const entry of queueEntries) {
      if (!serverIds.has(entry.photoId)) {
        out.push({
          id: entry.photoId,
          displayOrder: 999,  // append to end; will reconcile on next photo refetch
          status: entry.retries < 0 ? 'failed' : 'pending',
          src: blobUrlFor(queueEntries, blobUrls, entry.photoId),
        });
      }
    }
    return out.sort((a, b) => a.displayOrder - b.displayOrder);
  }, [photosQ.data, queueEntries, blobUrls]);

  const canAdd = combined.length < MAX_PHOTOS && !capturing;
  const isFirstCapture = combined.length === 0;
  const handleTap = (photoId: string) => {
    onTapThumb(photoId);
  };

  // Scroll-state tracking for the arrow visibility. canScrollLeft/Right
  // gate whether the chevron buttons render so we don't show "previous"
  // when already at the start. Initial check + scroll + resize listeners
  // keep them in sync as the strip mounts, scrolls, or the viewport
  // changes (e.g., mobile rotation, modal open/close).
  const stripRef = useRef<HTMLDivElement | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  useEffect(() => {
    const el = stripRef.current;
    if (!el) return;
    const update = () => {
      setCanScrollLeft(el.scrollLeft > 1);
      setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', update);
      ro.disconnect();
    };
  }, [combined.length, canAdd]);

  const scrollBy = (delta: number) => {
    stripRef.current?.scrollBy({ left: delta, behavior: 'smooth' });
  };

  return (
    <div className="space-y-2">
      {/* Capture CTA — gradient when no photos, compact when adding more */}
      {isFirstCapture ? (
        <button
          type="button"
          onClick={onCapture}
          disabled={!canAdd && !isFirstCapture}
          className="w-full h-24 rounded-lg bg-gradient-to-br from-brand to-brand/80 text-white font-semibold text-base flex items-center justify-center gap-3 shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <CameraIcon size={28} />
          Capture first photo
        </button>
      ) : (
        <button
          type="button"
          onClick={onCapture}
          disabled={!canAdd}
          className="w-full h-11 rounded-md bg-brand text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <CameraIcon size={16} />
          {capturing ? 'Capturing…' : 'Add Photo'}
        </button>
      )}

      {/* Thumbnail row — fixed-size tiles with horizontal scroll */}
      {combined.length > 0 && (
        <div className="relative">
          <div
            ref={stripRef}
            className="flex gap-1.5 overflow-x-auto scroll-smooth pb-1 -mx-0.5 px-0.5"
            // Hide native scrollbar — arrow buttons + swipe are the
            // navigation affordances.
            style={{ scrollbarWidth: 'none' }}
          >
            {combined.map((p, idx) => (
              <button
                key={p.id}
                type="button"
                onClick={() => handleTap(p.id)}
                className={`flex-shrink-0 w-20 h-20 rounded-md overflow-hidden relative border ${
                  idx === 0 ? 'border-2 border-brand' : 'border-border'
                }`}
              >
                {p.src ? (
                  <img src={p.src} alt={`Photo ${idx + 1}`} className="size-full object-cover" />
                ) : (
                  <div className="size-full bg-surfaceAlt flex items-center justify-center text-textFaint text-xs">
                    #{idx + 1}
                  </div>
                )}
                {idx === 0 && (
                  <span className="absolute bottom-0.5 left-0.5 text-[8px] font-bold tracking-wider uppercase bg-brand text-white px-1 py-0.5 rounded">
                    Cover
                  </span>
                )}
                {p.status === 'pending' && (
                  <span className="absolute top-0.5 right-0.5 size-2 rounded-full bg-warning animate-pulse" />
                )}
                {p.status === 'failed' && (
                  <span className="absolute top-0.5 right-0.5 size-2 rounded-full bg-state-not-sellable" />
                )}
              </button>
            ))}
            {/* "+" tile when we can still add more */}
            {canAdd && (
              <button
                type="button"
                onClick={onCapture}
                className="flex-shrink-0 w-20 h-20 rounded-md border-2 border-dashed border-borderStrong bg-transparent flex items-center justify-center text-textFaint hover:bg-surfaceAlt"
                aria-label="Add photo"
              >
                +
              </button>
            )}
          </div>

          {canScrollLeft && (
            <button
              type="button"
              onClick={() => scrollBy(-ARROW_SCROLL_DELTA)}
              className="absolute left-0 top-1/2 -translate-y-1/2 z-10 size-8 rounded-full bg-surfaceSolid/95 border border-border shadow flex items-center justify-center text-text hover:bg-surfaceSolid"
              aria-label="Scroll thumbnails left"
            >
              <ChevronIcon dir="left" />
            </button>
          )}
          {canScrollRight && (
            <button
              type="button"
              onClick={() => scrollBy(ARROW_SCROLL_DELTA)}
              className="absolute right-0 top-1/2 -translate-y-1/2 z-10 size-8 rounded-full bg-surfaceSolid/95 border border-border shadow flex items-center justify-center text-text hover:bg-surfaceSolid"
              aria-label="Scroll thumbnails right"
            >
              <ChevronIcon dir="right" />
            </button>
          )}
        </div>
      )}

      <div className="text-[11px] text-textDim flex items-center justify-between">
        <span>{combined.length} / {MAX_PHOTOS} photos</span>
        {combined.length >= 1 && combined.length < MAX_PHOTOS && (
          <span>min 1, max {MAX_PHOTOS}</span>
        )}
      </div>
    </div>
  );
}

function blobUrlFor(entries: { photoId: string; blob: Blob }[], urls: string[], photoId: string): string | null {
  const idx = entries.findIndex((e) => e.photoId === photoId);
  return idx >= 0 ? urls[idx] ?? null : null;
}

// Manage object URLs derived from blobs; revoke on cleanup so we don't leak
// memory. Uses useMemo to derive synchronously (no setState-in-effect) and
// useEffect for the revocation cleanup. The length-only dep is intentional:
// upload-queue entries are append-only on capture and removed on success;
// at any given length the blob list is stable. A blob being replaced at the
// same index doesn't happen in our pipeline.
function useBlobUrls(blobs: Blob[]): string[] {
  const urls = useMemo(
    () => blobs.map((b) => URL.createObjectURL(b)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [blobs.length]
  );
  useEffect(() => {
    return () => {
      for (const u of urls) URL.revokeObjectURL(u);
    };
  }, [urls]);
  return urls;
}

function CameraIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 5h2l1-1.5h4L11 5h2a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" />
      <circle cx="8" cy="9" r="2.5" />
    </svg>
  );
}

function ChevronIcon({ dir }: { dir: 'left' | 'right' }) {
  return (
    <svg width={16} height={16} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {dir === 'left' ? <polyline points="10,3 5,8 10,13" /> : <polyline points="6,3 11,8 6,13" />}
    </svg>
  );
}
