// src/components/bulk/BulkDeleteDialog.tsx
import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

type Props = {
  open: boolean;
  onClose: () => void;
  count: number;
  onConfirm: () => Promise<void>;
  busy?: boolean;
};

export function BulkDeleteDialog({ open, onClose, count, onConfirm, busy }: Props) {
  const [text, setText] = useState('');
  const ok = text === 'DELETE';
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete {count} lots?</DialogTitle>
          <DialogDescription>This cannot be undone. Type <code className="font-mono">DELETE</code> to confirm.</DialogDescription>
        </DialogHeader>
        <input value={text} onChange={(e) => setText(e.target.value)} aria-label="Type DELETE to confirm"
          className="w-full h-9 rounded-md border border-borderStrong bg-surfaceSolid px-3 text-sm" />
        <DialogFooter>
          <Button variant="outline" onClick={() => { setText(''); onClose(); }} disabled={busy}>Cancel</Button>
          <Button variant="destructive" onClick={onConfirm} disabled={!ok || busy}>
            {busy ? 'Deleting…' : `Delete ${count} lots`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
