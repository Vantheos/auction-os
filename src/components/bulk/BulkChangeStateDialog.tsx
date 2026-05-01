// src/components/bulk/BulkChangeStateDialog.tsx
import { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { StatePill } from '@/components/ui/pill';
import { sharedLegalTransitions } from '@/hooks/useLotState';
import type { LotDTO, LotState } from '@shared/types';

type Props = {
  open: boolean;
  onClose: () => void;
  lots: LotDTO[];
  onConfirm: (to: LotState) => Promise<void>;
  busy?: boolean;
};

export function BulkChangeStateDialog({ open, onClose, lots, onConfirm, busy }: Props) {
  const shared = useMemo(() => sharedLegalTransitions(lots.map((l) => l.state)), [lots]);
  const [to, setTo] = useState<LotState | null>(null);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change status — {lots.length} lots</DialogTitle>
          <DialogDescription>
            Showing only transitions legal for every selected lot. Mixed selections with no shared transition are blocked.
          </DialogDescription>
        </DialogHeader>
        {shared.length === 0 ? (
          <div className="text-sm text-textDim p-4 rounded-md border border-border bg-surfaceAlt text-center">
            No shared legal transitions across the selection. Refine selection by current state and try again.
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {shared.map((s) => (
              <button key={s} type="button" onClick={() => setTo(s)}
                className={`px-3 py-2 rounded-md border ${to === s ? 'bg-info-bg border-brand' : 'border-border hover:bg-muted'}`}>
                <StatePill state={s} />
              </button>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={() => to && onConfirm(to)} disabled={!to || busy}>
            {busy ? 'Updating…' : `Apply to ${lots.length} lot${lots.length !== 1 ? 's' : ''}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
