// src/components/jobs/JobEditDialog.tsx
// Phase 5 Area 3 — edit form for an existing Job.
//
// Fields:
//   - jobNumber (required, free-form, 1-200 chars)
//   - startBid (decimal currency, required at server level via DB default;
//     editable here)
//   - shippable (boolean; AF360 wants `true`/`false` as a per-auction
//     setting when "Shipping Determined by Lot" is enabled in AF360)
//
// State lives in EditForm (a keyed child) so opening a different job
// initializes fresh from props — no useEffect-driven resets needed.
import { useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/toast';
import { useUpdateJob } from '@/hooks/useJobs';
import type { JobDTO, UpdateJobRequest } from '@shared/types';

export function JobEditDialog({
  job,
  customerId,
  open,
  onOpenChange,
}: {
  job: JobDTO;
  customerId: string;
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <EditForm key={job.id} job={job} customerId={customerId} onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function EditForm({
  job, customerId, onClose,
}: { job: JobDTO; customerId: string; onClose: () => void }) {
  const update = useUpdateJob(customerId);
  const { toast } = useToast();

  const [jobNumber, setJobNumber] = useState(job.jobNumber);
  const [startBid, setStartBid] = useState(job.startBid);
  const [shippable, setShippable] = useState(job.shippable);

  // Validate startBid format on the client to catch obvious typos before
  // the round-trip. Server enforces the same regex.
  const startBidValid = /^\d+(\.\d{1,2})?$/.test(startBid.trim());

  const onSave = async () => {
    const trimmedNumber = jobNumber.trim();
    const trimmedBid = startBid.trim();

    const patch: UpdateJobRequest = {};
    if (trimmedNumber !== job.jobNumber) patch.jobNumber = trimmedNumber;
    if (trimmedBid !== job.startBid) patch.startBid = trimmedBid;
    if (shippable !== job.shippable) patch.shippable = shippable;

    if (Object.keys(patch).length === 0) {
      onClose();
      return;
    }

    try {
      await update.mutateAsync({ id: job.id, ...patch });
      toast({ title: 'Job updated', variant: 'success' });
      onClose();
    } catch (err) {
      toast({
        title: 'Could not update job',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'danger',
      });
    }
  };

  return (
    <>
      <DialogHeader><DialogTitle>Edit job</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor="job-number">Job number</Label>
          <Input
            id="job-number"
            value={jobNumber}
            onChange={(e) => setJobNumber(e.target.value)}
            maxLength={200}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="job-start-bid">Start Bid</Label>
          <Input
            id="job-start-bid"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            value={startBid}
            onChange={(e) => setStartBid(e.target.value)}
          />
          <p className="text-xs text-textDim">
            Default starting bid for every lot in this job, in dollars (e.g. 5.00).
          </p>
          {!startBidValid && (
            <p className="text-xs text-danger">Start Bid must be a positive decimal.</p>
          )}
        </div>
        <div className="space-y-1">
          <Label htmlFor="job-shippable">Shippable lots</Label>
          <div className="flex items-center gap-2">
            <input
              id="job-shippable"
              type="checkbox"
              checked={shippable}
              onChange={(e) => setShippable(e.target.checked)}
              className="h-4 w-4"
            />
            <span className="text-sm">{shippable ? 'Yes' : 'No'}</span>
          </div>
          <p className="text-xs text-textDim">
            Set in AF360 Auction Details only if shipping is determined per lot.
          </p>
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={update.isPending}>Cancel</Button>
        <Button
          onClick={onSave}
          disabled={!jobNumber.trim() || !startBidValid || update.isPending}
        >
          {update.isPending ? 'Saving…' : 'Save'}
        </Button>
      </DialogFooter>
    </>
  );
}
