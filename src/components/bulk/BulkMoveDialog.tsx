// src/components/bulk/BulkMoveDialog.tsx
import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useCustomers } from '@/hooks/useCustomers';
import { useJobs } from '@/hooks/useJobs';

type Props = {
  open: boolean;
  onClose: () => void;
  count: number;
  onConfirm: (destinationJobId: string, reprintLabels: boolean) => Promise<void>;
  busy?: boolean;
};

export function BulkMoveDialog({ open, onClose, count, onConfirm, busy }: Props) {
  const [customerId, setCustomerId] = useState('');
  const [jobId, setJobId] = useState('');
  const [reprint, setReprint] = useState(true);
  const customers = useCustomers();
  const jobs = useJobs(customerId);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Move {count} lots to another Job</DialogTitle>
          <DialogDescription>Each lot gets a fresh lot number in the destination job.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Destination customer</Label>
            <select value={customerId}
              onChange={(e) => { setCustomerId(e.target.value); setJobId(''); }}
              className="w-full h-9 rounded-md border border-borderStrong bg-surfaceSolid px-2 text-sm">
              <option value="">Select…</option>
              {customers.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          {customerId && (() => {
            const openJobs = (jobs.data ?? []).filter((j) => !j.closedAt);
            if (jobs.data && openJobs.length === 0) {
              return (
                <div className="text-sm text-textDim p-3 rounded-md border border-border bg-surfaceAlt">
                  No open jobs for this customer. Create or reopen a job before moving.
                </div>
              );
            }
            return (
              <div className="space-y-1">
                <Label>Destination job</Label>
                <select value={jobId} onChange={(e) => setJobId(e.target.value)}
                  className="w-full h-9 rounded-md border border-borderStrong bg-surfaceSolid px-2 text-sm">
                  <option value="">Select…</option>
                  {openJobs.map((j) =>
                    <option key={j.id} value={j.id}>{j.jobNumber}</option>
                  )}
                </select>
              </div>
            );
          })()}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={reprint} onChange={(e) => setReprint(e.target.checked)} className="size-4" />
            Reprint labels after move
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={() => jobId && onConfirm(jobId, reprint)} disabled={!jobId || busy}>
            {busy ? 'Moving…' : `Move ${count} lots`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
