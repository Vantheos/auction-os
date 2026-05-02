// src/components/lot/LotDetail.tsx
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { StatePill } from '@/components/ui/pill';
import { LotEditForm, type LotFormValues } from './LotEditForm';
import { ChangeStateMenu } from './ChangeStateMenu';
import { MoveLotDialog } from './MoveLotDialog';
import { useUpdateLot, useChangeLotState, useMoveLot, useDeleteLot } from '@/hooks/useLotMutations';
import { useLabelPrint } from '@/hooks/useLabelPrint';
import { useLotPhotos } from '@/hooks/useLots';
import { useCapturePhoto } from '@/hooks/useCatalogSession';
import { usePhotoCapture } from '@/hooks/usePhotoCapture';
import { PhotoStrip } from '@/components/catalog/PhotoStrip';
import { PhotoManager } from '@/components/catalog/PhotoManager';
import { useRole } from '@/lib/auth';
import { useToast } from '@/components/ui/toast';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import type { LotDTO, LotState } from '@shared/types';

type Props = {
  lot: LotDTO;
  onClose?: () => void;
  canEdit?: boolean;
  canDelete?: boolean;
  onDirtyChange?: (dirty: boolean) => void;
};

// Sold lots are frozen for field edits — they preserve what was shown to bidders
// on the auction platform. To edit a sold lot, transition it to unassigned first.
const FROZEN_STATES: LotState[] = ['sold', 'picked-up', 'not-sellable'];

export function LotDetail({ lot, onClose, canEdit = true, canDelete = false, onDirtyChange }: Props) {
  const isFrozen = FROZEN_STATES.includes(lot.state);
  const [moveOpen, setMoveOpen] = useState(false);
  const [confirm, setConfirm] = useState<{ to: LotState } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteText, setDeleteText] = useState('');

  const photos = useLotPhotos(lot.id);
  const role = useRole();
  const { toast } = useToast();
  const updateLot = useUpdateLot();
  const changeState = useChangeLotState();
  const moveLot = useMoveLot();
  const deleteLot = useDeleteLot();
  const printLabel = useLabelPrint();

  const errorToast = (title: string) => (err: unknown) =>
    toast({
      title,
      description: err instanceof Error ? err.message : 'Unknown error',
      variant: 'danger',
    });

  // Photo add/manage — only wired for non-frozen lots. Frozen lots show
  // the existing read-only grid below; PhotoStrip and PhotoManager are not
  // mounted, so capture is impossible and tap-to-manage is a no-op.
  const [managerFocus, setManagerFocus] = useState<string | null>(null);
  const capturePhoto = useCapturePhoto(lot.id);
  const { openCamera, inputRef, onChange: onCameraChange } = usePhotoCapture(async (blob) => {
    try {
      await capturePhoto.mutateAsync(blob);
    } catch (err) {
      errorToast('Photo capture failed')(err);
    }
  });

  const handleSave = async (values: LotFormValues): Promise<void> => {
    try {
      await updateLot.mutateAsync({ id: lot.id, input: values });
      toast({ title: 'Lot updated', variant: 'success' });
    } catch (err) {
      errorToast('Could not update lot')(err);
      // Rethrow so LotEditForm's handleValid does NOT call reset(values) —
      // form stays dirty so the unsaved-changes warning still fires on close.
      throw err;
    }
  };

  const handlePickState = (to: LotState, requiresConfirm: boolean) => {
    if (requiresConfirm) {
      setConfirm({ to });
    } else {
      changeState.mutate(
        { id: lot.id, to },
        {
          onSuccess: () => toast({ title: `State changed to ${to}`, variant: 'success' }),
          onError: errorToast('Could not change state'),
        },
      );
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 pb-3 border-b border-border">
        <div className="size-16 rounded-md bg-surfaceAlt border border-border flex-shrink-0 overflow-hidden">
          {photos.data?.[0] && <div className="size-full bg-cover bg-center" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold text-text">Lot {lot.lotNumber ?? '—'}</h2>
            <StatePill state={lot.state} />
            {isFrozen && <span className="text-xs px-2 py-0.5 rounded-md bg-state-picked-up-bg text-state-picked-up">🔒 Read-only</span>}
          </div>
          <div className="text-sm text-textDim mt-1">
            {lot.customerName ?? 'Unassigned customer'} · <span className="font-mono text-xs">{lot.jobNumber ?? '—'}</span>
          </div>
        </div>
      </div>

      {isFrozen ? (
        // Frozen lots: read-only photo grid (no add, no manage). Preserves
        // what bidders saw on the auction platform.
        photos.data && photos.data.length > 0 && (
          <div>
            <div className="text-xs text-textDim mb-2">Photos ({photos.data.length})</div>
            <div className="grid grid-cols-4 gap-2">
              {photos.data.map((p) => (
                <div
                  key={p.id}
                  className={`aspect-square rounded-md border border-border bg-surfaceAlt overflow-hidden ${lot.state === 'not-sellable' ? 'opacity-60' : ''}`}
                >
                  {p.signedUrl ? (
                    <img src={p.signedUrl} alt="" className="size-full object-cover" />
                  ) : p.status === 'pending' ? (
                    <div className="size-full flex items-center justify-center text-[10px] text-textFaint">Uploading…</div>
                  ) : p.status === 'failed' ? (
                    <div className="size-full flex items-center justify-center text-[10px] text-state-not-sellable">Failed</div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        )
      ) : (
        // Editable lots: same PhotoStrip + PhotoManager UX as cataloging.
        // capture="environment" forces camera on mobile, file picker on desktop.
        <div>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={onCameraChange}
            style={{ display: 'none' }}
          />
          <PhotoStrip
            lotId={lot.id}
            onCapture={openCamera}
            capturing={capturePhoto.isPending}
            onTapThumb={setManagerFocus}
          />
        </div>
      )}

      {isFrozen ? (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <dt className="text-textDim">Title</dt><dd className="text-text">{lot.title ?? '—'}</dd>
          <dt className="text-textDim">Description</dt><dd className="text-text whitespace-pre-wrap">{lot.description ?? '—'}</dd>
          <dt className="text-textDim">Price</dt><dd className="text-text">{lot.price ? `$${lot.price}` : '—'}</dd>
          <dt className="text-textDim">Quantity</dt><dd className="text-text">{lot.quantity ?? '—'}</dd>
          <dt className="text-textDim">Special notes</dt><dd className="text-text">{lot.specialNotesCategory}{lot.specialNotesText ? ` — ${lot.specialNotesText}` : ''}</dd>
          <dt className="text-textDim">Untested</dt><dd className="text-text">{lot.untested ? 'Yes' : 'No'}</dd>
        </dl>
      ) : (
        canEdit && <LotEditForm lot={lot} onSubmit={handleSave} busy={updateLot.isPending} onDirtyChange={onDirtyChange} />
      )}

      <div className="flex flex-wrap gap-2 pt-3 border-t border-border">
        <Button variant="outline" onClick={() => printLabel.mutate(lot.id)} disabled={printLabel.isPending || lot.lotNumber === null}>
          {printLabel.isPending ? 'Printing…' : 'Reprint label'}
        </Button>
        {!isFrozen && (lot.state === 'assigned' || lot.state === 'unassigned') && (
          <Button variant="outline" onClick={() => setMoveOpen(true)}>Assign to Job</Button>
        )}
        <ChangeStateMenu current={lot.state} role={role} onPick={handlePickState} disabled={changeState.isPending} />
        {canDelete && (
          <Button variant="destructive" onClick={() => setConfirmDelete(true)}>Delete</Button>
        )}
        {onClose && <div className="flex-1" />}
        {onClose && <Button variant="ghost" onClick={onClose}>Close</Button>}
      </div>

      <MoveLotDialog
        open={moveOpen}
        onClose={() => setMoveOpen(false)}
        onConfirm={async (destinationJobId, reprint) => {
          try {
            await moveLot.mutateAsync({ id: lot.id, destinationJobId });
            toast({ title: 'Lot assigned', variant: 'success' });
            if (reprint) printLabel.mutate(lot.id);
            setMoveOpen(false);
          } catch (err) {
            errorToast('Could not assign lot')(err);
          }
        }}
        busy={moveLot.isPending}
      />

      <Dialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark Lot {lot.lotNumber} as {confirm?.to}?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-textDim">This is a terminal state and cannot be reversed (except not-sellable → unassigned).</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(null)}>Cancel</Button>
            <Button onClick={() => {
              if (!confirm) return;
              const target = confirm.to;
              changeState.mutate(
                { id: lot.id, to: target },
                {
                  onSuccess: () => toast({ title: `State changed to ${target}`, variant: 'success' }),
                  onError: errorToast('Could not change state'),
                },
              );
              setConfirm(null);
            }}>Confirm</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* PhotoManager — full-viewport overlay rendered INSIDE LotDetail's
          tree (no portal) so clicks stay descendants of the Inventory Dialog's
          DialogContent. If portaled to body, Radix's outside-click detector
          would see every PhotoManager click as "outside" and close the parent
          Dialog. fixed inset-0 + z-[100] handles the visual stacking; the DOM
          hierarchy handles the event handling. */}
      {managerFocus !== null && (
        <div className="fixed inset-0 z-[100]">
          <PhotoManager
            lotId={lot.id}
            initialFocusId={managerFocus}
            onClose={() => setManagerFocus(null)}
          />
        </div>
      )}

      <Dialog open={confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Lot {lot.lotNumber}?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-textDim">This cannot be undone. Type <code className="font-mono">DELETE</code> to confirm.</p>
          <input value={deleteText} onChange={(e) => setDeleteText(e.target.value)}
            className="w-full h-9 rounded-md border border-borderStrong bg-surfaceSolid px-3 text-sm" />
          <DialogFooter>
            <Button variant="outline" onClick={() => { setConfirmDelete(false); setDeleteText(''); }}>Cancel</Button>
            <Button variant="destructive" disabled={deleteText !== 'DELETE'} onClick={() => {
              deleteLot.mutate(lot.id, {
                onSuccess: () => {
                  toast({ title: 'Lot deleted', variant: 'success' });
                  setConfirmDelete(false);
                  // Reset dirty state before closing — the lot is gone, no
                  // point prompting "discard unsaved changes?" via the parent's
                  // guarded close.
                  onDirtyChange?.(false);
                  onClose?.();
                },
                onError: errorToast('Could not delete lot'),
              });
            }}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
