// src/components/catalog/EndSessionConfirm.tsx
// Modal that fires when the operator taps End Session while a lot is
// in progress. Two paths: Keep going (cancel close), Discard & End
// (delete the in-progress lot, return to picker).

import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

type Props = {
  open: boolean;
  hasInProgressLot: boolean;
  savedCount: number;
  onCancel: () => void;
  onDiscard: () => void;
  onKeep: () => void;
  busy?: boolean;
};

export function EndSessionConfirm({ open, hasInProgressLot, savedCount, onCancel, onDiscard, onKeep, busy }: Props) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>End cataloging session?</DialogTitle>
        </DialogHeader>
        <div className="text-sm text-textDim space-y-2">
          <p>
            You've finished <b className="text-text">{savedCount} lot{savedCount !== 1 ? 's' : ''}</b>{' '}
            in this session.
            {hasInProgressLot ? ' The current lot will be saved.' : ''}
          </p>
          {hasInProgressLot && (
            <p className="text-xs">
              Choose <b>Keep &amp; end</b> to save the in-progress lot as-is,
              or <b>Discard &amp; end</b> to drop it.
            </p>
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onCancel} disabled={busy}>Keep going</Button>
          {hasInProgressLot && (
            <>
              <Button variant="outline" onClick={onKeep} disabled={busy}>Keep & end</Button>
              <Button variant="destructive" onClick={onDiscard} disabled={busy}>
                {busy ? 'Discarding…' : 'Discard & end'}
              </Button>
            </>
          )}
          {!hasInProgressLot && (
            <Button onClick={onKeep} disabled={busy}>End session</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
