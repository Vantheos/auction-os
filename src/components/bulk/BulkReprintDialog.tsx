// src/components/bulk/BulkReprintDialog.tsx
//
// Phase 7. Confirm dialog for the bulk Reprint Labels action from the
// inventory bulk action bar. No additional input — operator picked the
// lots already; this dialog just confirms before firing the serial
// useBulkLabelPrint loop.
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

type Props = {
  open: boolean;
  onClose: () => void;
  count: number;
  onConfirm: () => Promise<void>;
  busy?: boolean;
};

export function BulkReprintDialog({ open, onClose, count, onConfirm, busy }: Props) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reprint labels</DialogTitle>
          <DialogDescription>
            Reprint labels for <strong>{count}</strong> selected {count === 1 ? 'lot' : 'lots'}? The
            print jobs will be sent one at a time. After they're sent you'll be asked to verify the
            printed stack — Browser Print can't confirm the printer actually produced each label.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={onConfirm} disabled={busy}>
            {busy ? 'Sending…' : `Reprint ${count} ${count === 1 ? 'label' : 'labels'}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
