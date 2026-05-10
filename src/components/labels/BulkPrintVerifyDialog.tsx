// src/components/labels/BulkPrintVerifyDialog.tsx
//
// Phase 7. Modal popup shown at the end of any bulk-label-print operation
// (BulkMoveDialog with reprint=true, or the new bulk Reprint Labels action).
//
// Why this exists: Browser Print's HTTP 200 on /write means "ZPL accepted
// into queue," not "label produced." We can't tell the operator with
// confidence that any given label printed. So instead of pretending, we
// surface the boundary explicitly: "Sent N print jobs — check your stack."
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

type Props = {
  open: boolean;
  onClose: () => void;
  sentCount: number;
  failedCount: number;
};

export function BulkPrintVerifyDialog({ open, onClose, sentCount, failedCount }: Props) {
  const total = sentCount + failedCount;
  const allOk = failedCount === 0;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Label print sent</DialogTitle>
          <DialogDescription>
            {allOk ? (
              <>
                Sent <strong>{sentCount}</strong> label print {sentCount === 1 ? 'job' : 'jobs'} to the printer.
                Please check your stack of labels — if any are missing, find the affected lots in
                Inventory and reprint them individually or via the <strong>Reprint pending</strong> filter.
              </>
            ) : (
              <>
                Sent <strong>{sentCount}</strong> of <strong>{total}</strong> label print jobs.
                The remaining <strong>{failedCount}</strong> could not reach the printer (helper offline /
                printer disconnected). The Reprint pending pill is still set on those lots — find them via
                the <strong>Reprint pending</strong> filter and try again. Please also check the printed
                stack for any missing labels.
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={onClose}>OK</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
