// src/components/catalog/LotInProgress.tsx
// The main cataloging screen. Composes the photo strip, fields (in
// warehouse-priority order from the mockup), Print Label button, and
// the End Session / Next footer.
//
// Field changes autosave to the server (1.5s debounce, plus on field
// blur and on Next) AND mirror to IndexedDB on every keystroke (200ms
// debounce) so a tab close mid-edit loses at most ~200ms of typing.

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useToast } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { useCatalogSession, useUpdateLotFields } from '@/hooks/useCatalogSession';
import { useFormMirror } from '@/hooks/useFormMirror';
import { usePhotoCapture } from '@/hooks/usePhotoCapture';
import { useCapturePhoto } from '@/hooks/useCatalogSession';
import { useLot } from '@/hooks/useLots';
import { useLabelPrint } from '@/hooks/useLabelPrint';
import { useCustomers } from '@/hooks/useCustomers';
import { useJobs } from '@/hooks/useJobs';
import { PhotoStrip } from './PhotoStrip';
import { PhotoManager } from './PhotoManager';
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
  const { customerId, jobId, lotId, lotNumber, advance, captureFirst, isCapturingFirst, discardCurrent } = useCatalogSession();
  const lotQ = useLot(lotId ?? undefined);
  const { mirror, loaded: mirrorLoaded, saveFields: saveMirror, clear: clearMirror } = useFormMirror(lotId);
  const updateFields = useUpdateLotFields(lotId);
  const capturePhoto = useCapturePhoto(lotId);
  const printLabel = useLabelPrint();
  const { toast } = useToast();

  // Customer + job lookup for the session header. Both queries cache, so the
  // ambient impact is one fetch on first session entry per (customer, job).
  const customers = useCustomers();
  const jobs = useJobs(customerId ?? undefined);
  const customer = customers.data?.find((c) => c.id === customerId);
  const job = jobs.data?.find((j) => j.id === jobId);

  const [fields, setFields] = useState<FormFields>(EMPTY_FIELDS);
  const [hydrated, setHydrated] = useState(false);
  const [managerFocus, setManagerFocus] = useState<string | null>(null);
  // "Additional Info" collapse — Title / Description / Price / Ref1 / Ref2
  // hidden by default per option-c-flow design spec, so the Next button is
  // reachable without scrolling on most lots. AI fills these on the
  // back-channel; warehouse only expands to override AI output.
  const [showAdditionalInfo, setShowAdditionalInfo] = useState(false);
  // Free-form mirror for the quantity input so the user can backspace
  // through the value without the controlled input snapping back to 1
  // on every keystroke. Validation/clamp happens on blur. Synced from
  // fields.quantity when that changes externally (hydration, advance, etc.).
  const [quantityInput, setQuantityInput] = useState<string>(String(fields.quantity));
  const autosaveTimer = useRef<number | null>(null);
  const printRetried = useRef(false);

  // After a page reload, useCatalogSession restores lotId from the URL but
  // not lotNumber (since the URL only carries the id). Fall back to the
  // lot data from useLot until/unless setLot has been called explicitly.
  const displayLotNumber = lotNumber ?? lotQ.data?.lotNumber ?? null;

  // Keep the quantity input mirror in sync when fields.quantity changes
  // from a non-input source (hydration, advance to new lot). User-initiated
  // edits flow input → state via onChange/onBlur, not through this effect.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setQuantityInput(String(fields.quantity));
  }, [fields.quantity]);

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
        quantity: lotQ.data.quantity,
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
                  title: `Label print failed${displayLotNumber ? ` — Lot ${displayLotNumber} saved` : ''}`,
                  description: 'Reprint from Inventory.',
                  variant: 'warning',
                });
              },
            });
          }, 800);
        }
      },
    });
  }, [lotId, displayLotNumber, printLabel, toast]);

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
    <div className="min-h-[100dvh] flex flex-col bg-wash relative">
      {/* Hidden file input owned by the camera hook */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={onCameraChange}
        style={{ display: 'none' }}
      />

      {/* Header — customer + job context on left, big lot number on right
          (per option-c-flow design spec). Pending-uploads indicator moves
          out of the header to the body status line below the photo strip. */}
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
          <div className="text-sm font-semibold text-text truncate">{customer?.name ?? '—'}</div>
          <div className="text-[10px] text-textDim font-mono truncate mt-0.5">{job?.jobNumber ?? '—'}</div>
        </div>
        <div className="text-right flex-shrink-0">
          <div className="text-[10px] uppercase tracking-wide text-textDim font-semibold leading-none">Lot</div>
          <div className="text-3xl font-bold leading-none text-brand font-mono tabular-nums mt-1">
            {displayLotNumber ?? '—'}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        <PhotoStrip lotId={lotId} onCapture={openCamera} capturing={isCapturingFirst} onTapThumb={setManagerFocus} />

        {/* Pending uploads status — moved here from header per option-c-flow
            spec line 306 (status line below the photo strip). */}
        <PendingUploadsIndicator />

        {hydrated && (
          <>
            {/* Row 1 — Quantity (free-form input) + Untested toggle. The
                +/- stepper was dropped in favor of a plain numeric input —
                same UX as the inventory edit modal, fewer rendering quirks
                across mobile devices, and quantity changes are rare during
                cataloging (most lots are 1). */}
            <div className="grid grid-cols-2 gap-2">
              <Field label="Quantity">
                <input
                  type="number"
                  min={1}
                  inputMode="numeric"
                  value={quantityInput}
                  onChange={(e) => setQuantityInput(e.target.value)}
                  onBlur={() => {
                    const n = parseInt(quantityInput, 10);
                    const finalValue = Number.isFinite(n) && n >= 1 ? n : 1;
                    setQuantityInput(String(finalValue));
                    if (finalValue !== fields.quantity) {
                      patch({ quantity: finalValue });
                    }
                    flushAutosave();
                  }}
                  className="w-full h-10 px-3 rounded-md border border-borderStrong bg-surfaceSolid text-sm"
                />
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

            {/* Row 2 — Special Notes (full width, required) */}
            <Field label="Special notes" required>
              <select
                value={fields.specialNotesCategory}
                onChange={(e) => patch({ specialNotesCategory: e.target.value as FormFields['specialNotesCategory'] })}
                className="w-full h-10 px-3 rounded-md border border-borderStrong bg-surfaceSolid text-sm"
              >
                <option>None</option><option>TOOL ONLY</option><option>READ</option><option>CLOTHING</option>
              </select>
            </Field>

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

            {/* Additional Info — collapsed by default. Title / Description /
                Price / Ref1 / Ref2 hidden until expanded so the Next button
                is reachable without scrolling. AI fills title/description/
                price; warehouse only expands to override. */}
            <button
              type="button"
              onClick={() => setShowAdditionalInfo(!showAdditionalInfo)}
              className="w-full flex items-center gap-2 px-3 py-2.5 rounded-md border border-border bg-surfaceAlt text-sm font-medium text-textDim text-left"
              aria-expanded={showAdditionalInfo}
            >
              {showAdditionalInfo ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <span>Additional Info</span>
            </button>

            {showAdditionalInfo && (
              <div className="space-y-3 p-3 rounded-md border border-border bg-surfaceSolid">
                <Field label="Title" hint="max 50 chars">
                  <input
                    maxLength={50}
                    value={fields.title}
                    onChange={(e) => patch({ title: e.target.value })}
                    onBlur={flushAutosave}
                    placeholder="AI will fill"
                    className="w-full h-10 px-3 rounded-md border border-borderStrong bg-surfaceSolid text-sm"
                  />
                </Field>

                <Field label="Description">
                  <textarea
                    rows={3}
                    value={fields.description}
                    onChange={(e) => patch({ description: e.target.value })}
                    onBlur={flushAutosave}
                    placeholder="AI will fill"
                    className="w-full px-3 py-2 rounded-md border border-borderStrong bg-surfaceSolid text-sm resize-y"
                  />
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
              </div>
            )}

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

      {/* PhotoManager — full-viewport inline overlay (no portal, no route).
          Tapping a thumbnail in PhotoStrip sets managerFocus, mounting this.
          onLotDeleted = discardCurrent so last-photo cascade deletes the
          server lot AND resets the session state (form mirror cleared, lotId
          reset) atomically, then PhotoManager unmounts via onClose. */}
      {managerFocus !== null && lotId && (
        <div className="fixed inset-0 z-[100]">
          <PhotoManager
            lotId={lotId}
            initialFocusId={managerFocus}
            onClose={() => setManagerFocus(null)}
            onLotDeleted={discardCurrent}
          />
        </div>
      )}
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
