// src/components/bulk/ExportCsvDialog.tsx
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

const COLUMNS = [
  'id', 'customer', 'job', 'lot_number', 'state', 'title', 'description',
  'price', 'special_notes_category', 'special_notes_text', 'untested',
  'quantity', 'ai_status', 'created_at', 'updated_at',
];

type Props = {
  open: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  busy?: boolean;
};

export function ExportCsvDialog({ open, onClose, onConfirm, busy }: Props) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Export CSV</DialogTitle>
          <DialogDescription>Download a CSV of lots matching the current filters.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <div className="text-xs text-textDim">Columns included:</div>
          <ul className="text-xs font-mono text-text grid grid-cols-2 gap-x-4 gap-y-1">
            {COLUMNS.map((c) => <li key={c}>{c}</li>)}
          </ul>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={onConfirm} disabled={busy}>{busy ? 'Preparing…' : 'Download CSV'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
