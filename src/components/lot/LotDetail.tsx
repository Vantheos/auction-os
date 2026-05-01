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
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import type { LotDTO, LotState } from '@shared/types';

type Props = { lot: LotDTO; onClose?: () => void; canEdit?: boolean; canDelete?: boolean; };

const FROZEN_STATES: LotState[] = ['picked-up', 'not-sellable'];

export function LotDetail({ lot, onClose, canEdit = true, canDelete = false }: Props) {
  const isFrozen = FROZEN_STATES.includes(lot.state);
  const [moveOpen, setMoveOpen] = useState(false);
  const [confirm, setConfirm] = useState<{ to: LotState } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteText, setDeleteText] = useState('');

  const photos = useLotPhotos(lot.id);
  const updateLot = useUpdateLot();
  const changeState = useChangeLotState();
  const moveLot = useMoveLot();
  const deleteLot = useDeleteLot();
  const printLabel = useLabelPrint();

  const handleSave = async (values: LotFormValues): Promise<void> => {
    await updateLot.mutateAsync({ id: lot.id, input: values });
  };

  const handlePickState = (to: LotState, requiresConfirm: boolean) => {
    if (requiresConfirm) setConfirm({ to });
    else changeState.mutate({ id: lot.id, to });
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

      {photos.data && photos.data.length > 0 && (
        <div>
          <div className="text-xs text-textDim mb-2">Photos ({photos.data.length})</div>
          <div className="grid grid-cols-4 gap-2">
            {photos.data.map((p) => (
              <div key={p.id} className={`aspect-square rounded-md border border-border bg-surfaceAlt overflow-hidden ${lot.state === 'not-sellable' ? 'opacity-60' : ''}`} />
            ))}
          </div>
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
        canEdit && <LotEditForm lot={lot} onSubmit={handleSave} busy={updateLot.isPending} />
      )}

      <div className="flex flex-wrap gap-2 pt-3 border-t border-border">
        <Button variant="outline" onClick={() => printLabel.mutate(lot.id)} disabled={printLabel.isPending || lot.lotNumber === null}>
          {printLabel.isPending ? 'Printing…' : 'Reprint label'}
        </Button>
        {!isFrozen && lot.state === 'assigned' && (
          <Button variant="outline" onClick={() => setMoveOpen(true)}>Move to another auction</Button>
        )}
        <ChangeStateMenu current={lot.state} onPick={handlePickState} disabled={changeState.isPending} />
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
          await moveLot.mutateAsync({ id: lot.id, destinationJobId });
          if (reprint) printLabel.mutate(lot.id);
          setMoveOpen(false);
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
              if (confirm) changeState.mutate({ id: lot.id, to: confirm.to });
              setConfirm(null);
            }}>Confirm</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
              deleteLot.mutate(lot.id, { onSuccess: () => { setConfirmDelete(false); onClose?.(); } });
            }}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
