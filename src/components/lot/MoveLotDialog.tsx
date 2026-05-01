// src/components/lot/MoveLotDialog.tsx
import { useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useCustomers } from '@/hooks/useCustomers';
import { useJobs } from '@/hooks/useJobs';

type Props = {
  open: boolean;
  onClose: () => void;
  onConfirm: (destinationJobId: string, reprintLabel: boolean) => Promise<void> | void;
  busy?: boolean;
};

export function MoveLotDialog({ open, onClose, onConfirm, busy }: Props) {
  const [customerId, setCustomerId] = useState<string>('');
  const [jobId, setJobId] = useState<string>('');
  const [reprint, setReprint] = useState(true);
  const customers = useCustomers();
  const jobs = useJobs(customerId);
  const canSubmit = !!jobId;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Move lot to another auction</DialogTitle>
          <DialogDescription>Select destination customer and job. A new lot number will be assigned.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="dest-customer">Destination customer</Label>
            <select id="dest-customer" value={customerId}
              onChange={(e) => { setCustomerId(e.target.value); setJobId(''); }}
              className="w-full h-9 rounded-md border border-borderStrong bg-surfaceSolid px-2 text-sm">
              <option value="">Select…</option>
              {customers.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          {customerId && (
            <div className="space-y-1">
              <Label htmlFor="dest-job">Destination job</Label>
              <select id="dest-job" value={jobId} onChange={(e) => setJobId(e.target.value)}
                className="w-full h-9 rounded-md border border-borderStrong bg-surfaceSolid px-2 text-sm">
                <option value="">Select…</option>
                {jobs.data?.filter((j) => !j.closedAt).map((j) =>
                  <option key={j.id} value={j.id}>{j.jobNumber}</option>
                )}
              </select>
            </div>
          )}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={reprint} onChange={(e) => setReprint(e.target.checked)} className="size-4" />
            Reprint label after move
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={() => canSubmit && onConfirm(jobId, reprint)} disabled={!canSubmit || busy}>
            {busy ? 'Moving…' : 'Move lot'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
