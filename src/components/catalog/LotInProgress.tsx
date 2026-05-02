// src/components/catalog/LotInProgress.tsx
// The main cataloging screen. Composes the photo strip, fields (in
// warehouse-priority order from the mockup), Print Label button, and
// the End Session / Next footer.
//
// Field changes autosave to the server (1.5s debounce, plus on field
// blur and on Next) AND mirror to IndexedDB on every keystroke (200ms
// debounce) so a tab close mid-edit loses at most ~200ms of typing.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useToast } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { useCatalogSession, useUpdateLotFields } from '@/hooks/useCatalogSession';
import { useFormMirror } from '@/hooks/useFormMirror';
import { usePhotoCapture } from '@/hooks/usePhotoCapture';
import { useCapturePhoto } from '@/hooks/useCatalogSession';
import { useLot } from '@/hooks/useLots';
import { useLabelPrint } from '@/hooks/useLabelPrint';
import { PhotoStrip } from './PhotoStrip';
import { PendingUploadsIndicator } from './PendingUploadsIndicator';

type FormFields = {
  title: string;
  description: string;
  price: string;
  quantity: number;
  ref1: string;
  ref2: string;
  specialNotesCategory: 'None' | 'TOOL ONLY' | 'READ' | 'CLOTHING';
  specialNotesText: string;
  untested: boolean;
};

const EMPTY_FIELDS: FormFields = {
  title: '', description: '', price: '', quantity: 1,
  ref1: '', ref2: '',
  specialNotesCategory: 'None', specialNotesText: '', untested: false,
};

const AUTOSAVE_MS = 1500;

type Props = {
  onEndSession: () => void;
};

export function LotInProgress({ onEndSession }: Props) {
  const { jobId, lotId, lotNumber, advance, captureFirst, isCapturingFirst } = useCatalogSession();
  const lotQ = useLot(lotId ?? undefined);
  const { mirror, loaded: mirrorLoaded, saveFields: saveMirror, clear: clearMirror } = useFormMirror(lotId);
  const updateFields = useUpdateLotFields(lotId);
  const capturePhoto = useCapturePhoto(lotId);
  const printLabel = useLabelPrint();
  const { toast } = useToast();

  const [fields, setFields] = useState<FormFields>(EMPTY_FIELDS);
  const [hydrated, setHydrated] = useState(false);
  const autosaveTimer = useRef<number | null>(null);
  const printRetried = useRef(false);

  // Hydrate fields from server lot (authoritative) or IDB mirror (fallback).
  //
  // react-hooks/set-state-in-effect: this is genuine external sync — the
  // form needs LOCAL state for editing, but two ASYNC sources can
  // legitimately update it (server lot fetch + IDB mirror load). The
  // wrapper-pattern alternative (split into outer-that-waits + inner-with-
  // useState-initializer + key={lotId}) would work but adds significant
  // indirection for a pattern that's correct as written.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!lotId) {
      setFields(EMPTY_FIELDS);
      setHydrated(true);
      return;
    }
    if (lotQ.data) {
      setFields({
        title: lotQ.data.title ?? '',
        description: lotQ.data.description ?? '',
        price: lotQ.data.price ?? '',
        quantity: lotQ.data.quantity ?? 1,
        ref1: lotQ.data.ref1 ?? '',
        ref2: lotQ.data.ref2 ?? '',
        specialNotesCategory: lotQ.data.specialNotesCategory,
        specialNotesText: lotQ.data.specialNotesText ?? '',
        untested: lotQ.data.untested,
      });
      setHydrated(true);
    } else if (mirrorLoaded && mirror) {
      // Pre-server fallback (rare): server fetch hasn't returned yet but IDB has the latest typing
      setFields({ ...EMPTY_FIELDS, ...(mirror.fields as Partial<FormFields>) });
      setHydrated(true);
    }
  }, [lotId, lotQ.data, mirror, mirrorLoaded]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Patch helper — applies a partial change, mirrors to IDB immediately,
  // and schedules a debounced server PATCH.
  const patch = useCallback((next: Partial<FormFields>) => {
    setFields((prev) => {
      const merged = { ...prev, ...next };
      saveMirror(merged as Record<string, unknown>);
      if (autosaveTimer.current !== null) window.clearTimeout(autosaveTimer.current);
      if (lotId) {
        autosaveTimer.current = window.setTimeout(() => {
          updateFields.mutate(toServerShape(merged), {
            onError: () => toast({
              title: 'Saving paused',
              description: 'Reconnecting…',
              variant: 'warning',
            }),
          });
          autosaveTimer.current = null;
        }, AUTOSAVE_MS);
      }
      return merged;
    });
  }, [lotId, saveMirror, updateFields, toast]);

  // Flush autosave on unmount and Next
  const flushAutosave = useCallback(() => {
    if (autosaveTimer.current !== null) {
      window.clearTimeout(autosaveTimer.current);
      autosaveTimer.current = null;
    }
    if (lotId) {
      updateFields.mutate(toServerShape(fields));
    }
  }, [lotId, fields, updateFields]);

  useEffect(() => () => {
    if (autosaveTimer.current !== null) window.clearTimeout(autosaveTimer.current);
  }, []);

  // Photo capture handler — first photo creates the lot row + photo row + queues the upload
  const handleBlob = useCallback(async (blob: Blob) => {
    try {
      if (!lotId) {
        await captureFirst(blob);
      } else {
        await capturePhoto.mutateAsync(blob);
      }
    } catch (e) {
      toast({
        title: 'Photo capture failed',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'danger',
      });
    }
  }, [lotId, captureFirst, capturePhoto, toast]);

  const { openCamera, inputRef, onChange: onCameraChange } = usePhotoCapture(handleBlob);

  // Print label — 1 silent retry then toast on second failure
  const handlePrint = useCallback(() => {
    if (!lotId) return;
    printRetried.current = false;
    printLabel.mutate(lotId, {
      onError: () => {
        if (!printRetried.current) {
          printRetried.current = true;
          window.setTimeout(() => {
            printLabel.mutate(lotId, {
              onError: () => {
                toast({
                  title: `Label print failed${lotNumber ? ` — Lot ${lotNumber} saved` : ''}`,
                  description: 'Reprint from Inventory.',
                  variant: 'warning',
                });
              },
            });
          }, 800);
        }
      },
    });
  }, [lotId, lotNumber, printLabel, toast]);

  const handleNext = useCallback(() => {
    if (!lotId) return;
    flushAutosave();
    void clearMirror();
    advance();
    setFields(EMPTY_FIELDS);
  }, [lotId, flushAutosave, clearMirror, advance]);

  if (!jobId) {
    return <div className="p-4 text-sm text-danger">No job in session.</div>;
  }

  return (
    <div className="min-h-screen flex flex-col bg-wash relative">
      {/* Hidden file input owned by the camera hook */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={onCameraChange}
        style={{ display: 'none' }}
      />

      {/* Header */}
      <div className="px-4 py-3 bg-gradient-to-b from-info-bg to-transparent border-b border-border flex items-center gap-3">
        <button
          type="button"
          onClick={onEndSession}
          className="text-textDim hover:text-text transition-colors"
          aria-label="End session"
        >
          ←
        </button>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-text truncate">In progress</div>
          <PendingUploadsIndicator />
        </div>
        <div className="text-right flex-shrink-0">
          <div className="text-[10px] uppercase tracking-wide text-textDim font-semibold leading-none">Lot</div>
          <div className="text-3xl font-bold leading-none text-brand font-mono tabular-nums mt-1">
            {lotNumber ?? '—'}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        <PhotoStrip lotId={lotId} onCapture={openCamera} capturing={isCapturingFirst} />

        {hydrated && (
          <>
            {/* Row 1 — Special Notes + Untested (warehouse priority) */}
            <div className="grid grid-cols-2 gap-2">
              <Field label="Special notes" required>
                <select
                  value={fields.specialNotesCategory}
                  onChange={(e) => patch({ specialNotesCategory: e.target.value as FormFields['specialNotesCategory'] })}
                  className="w-full h-10 px-3 rounded-md border border-borderStrong bg-surfaceSolid text-sm"
                >
                  <option>None</option><option>TOOL ONLY</option><option>READ</option><option>CLOTHING</option>
                </select>
              </Field>
              <Field label="Untested">
                <button
                  type="button"
                  onClick={() => patch({ untested: !fields.untested })}
                  className={`w-full h-10 px-3 rounded-md border flex items-center gap-2 text-sm font-medium ${
                    fields.untested ? 'border-brand bg-info-bg text-brand' : 'border-borderStrong bg-surfaceSolid text-text'
                  }`}
                >
                  <span className={`size-4 rounded-sm border-2 flex items-center justify-center text-white text-xs ${
                    fields.untested ? 'border-brand bg-brand' : 'border-borderStrong'
                  }`}>
                    {fields.untested && '✓'}
                  </span>
                  Untested
                </button>
              </Field>
            </div>

            {/* Row 2 — Quantity stepper + Price */}
            <div className="grid grid-cols-2 gap-2">
              <Field label="Quantity">
                <div className="flex items-center h-10 border border-borderStrong rounded-md bg-surfaceSolid overflow-hidden">
                  <button type="button"
                    onClick={() => patch({ quantity: Math.max(1, fields.quantity - 1) })}
                    className="w-9 h-full bg-surfaceAlt border-r border-border text-text">−</button>
                  <input
                    type="number"
                    min={1}
                    value={fields.quantity}
                    onChange={(e) => patch({ quantity: Math.max(1, parseInt(e.target.value) || 1) })}
                    onBlur={flushAutosave}
                    className="flex-1 h-full text-center font-semibold tabular-nums bg-transparent outline-none"
                  />
                  <button type="button"
                    onClick={() => patch({ quantity: fields.quantity + 1 })}
                    className="w-9 h-full bg-surfaceAlt border-l border-border text-text">+</button>
                </div>
              </Field>
              <Field label="Price">
                <input
                  value={fields.price}
                  onChange={(e) => patch({ price: e.target.value })}
                  onBlur={flushAutosave}
                  placeholder="$"
                  className="w-full h-10 px-3 rounded-md border border-borderStrong bg-surfaceSolid text-sm"
                />
              </Field>
            </div>

            {/* Row 3 — conditional Size for CLOTHING */}
            {fields.specialNotesCategory === 'CLOTHING' && (
              <Field label="Size">
                <input
                  value={fields.specialNotesText}
                  onChange={(e) => patch({ specialNotesText: e.target.value })}
                  onBlur={flushAutosave}
                  placeholder="e.g., Large"
                  className="w-full h-10 px-3 rounded-md border border-borderStrong bg-surfaceSolid text-sm"
                />
              </Field>
            )}

            {/* Title */}
            <Field label="Title" hint="max 50 chars">
              <input
                maxLength={50}
                value={fields.title}
                onChange={(e) => patch({ title: e.target.value })}
                onBlur={flushAutosave}
                placeholder="Optional — AI fills if left blank"
                className="w-full h-10 px-3 rounded-md border border-borderStrong bg-surfaceSolid text-sm"
              />
            </Field>

            {/* Description */}
            <Field label="Description">
              <textarea
                rows={3}
                value={fields.description}
                onChange={(e) => patch({ description: e.target.value })}
                onBlur={flushAutosave}
                placeholder="Optional"
                className="w-full px-3 py-2 rounded-md border border-borderStrong bg-surfaceSolid text-sm resize-y"
              />
            </Field>

            {/* Refs */}
            <div className="grid grid-cols-2 gap-2">
              <Field label="Ref 1">
                <input
                  value={fields.ref1}
                  onChange={(e) => patch({ ref1: e.target.value })}
                  onBlur={flushAutosave}
                  className="w-full h-10 px-3 rounded-md border border-borderStrong bg-surfaceSolid text-sm"
                />
              </Field>
              <Field label="Ref 2">
                <input
                  value={fields.ref2}
                  onChange={(e) => patch({ ref2: e.target.value })}
                  onBlur={flushAutosave}
                  className="w-full h-10 px-3 rounded-md border border-borderStrong bg-surfaceSolid text-sm"
                />
              </Field>
            </div>

            {/* Print Label — manual per D-004 */}
            <Button
              variant="outline"
              onClick={handlePrint}
              disabled={!lotId || printLabel.isPending}
              className="w-full"
            >
              {printLabel.isPending ? 'Printing…' : '🖨️ Print Label'}
            </Button>
          </>
        )}
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-border bg-surfaceSolid flex gap-2">
        <Button variant="outline" onClick={onEndSession} className="h-12 px-4">
          End session
        </Button>
        <Button
          onClick={handleNext}
          disabled={!lotId}
          className="flex-1 h-12 text-base"
        >
          Next →
        </Button>
      </div>
    </div>
  );
}

function Field({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] text-textDim font-medium mb-1 flex items-center gap-1.5">
        <span>{label}{required && <span className="text-danger ml-0.5">*</span>}</span>
        {hint && <span className="text-textFaint text-[10px] font-normal">({hint})</span>}
      </div>
      {children}
    </div>
  );
}

function toServerShape(f: FormFields) {
  return {
    title: f.title || null,
    description: f.description || null,
    price: f.price || null,
    quantity: f.quantity,
    ref1: f.ref1 || null,
    ref2: f.ref2 || null,
    specialNotesCategory: f.specialNotesCategory,
    specialNotesText: f.specialNotesText || null,
    untested: f.untested,
  };
}
