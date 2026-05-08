// src/components/bulk/BulkResetAiDialog.tsx
// Confirmation dialog for the bulk Reset AI action. Reset clears
// lastAiRunStatus / lastAiRunError / aiProcessingStartedAt on each
// selected lot so AI can run on them again. Lots without an AI status
// to reset are silently a no-op server-side; lots with an in-flight
// AI lock (<5 min) are refused with a per-lot error.

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

type Props = {
  open: boolean;
  onClose: () => void;
  count: number;
  onConfirm: () => Promise<void>;
  busy?: boolean;
};

export function BulkResetAiDialog({ open, onClose, count, onConfirm, busy }: Props) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reset AI status for {count} lot{count !== 1 ? 's' : ''}?</DialogTitle>
          <DialogDescription>
            Clears the AI status and error on each selected lot, making them eligible for AI processing again.
            Operator-entered title, description, and price are preserved by the AI run that follows.
            Lots with an AI run currently in progress are skipped automatically.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={onConfirm} disabled={busy}>
            {busy ? 'Resetting…' : `Reset AI on ${count} lot${count !== 1 ? 's' : ''}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
