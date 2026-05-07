// src/components/jobs/JobExportButton.tsx
//
// Phase 5 Area 6 — primary "Export to AF360" action per Job row.
//
// Hidden for warehouse role. Disabled while an export is in progress.
// Surfaces step-by-step progress + per-batch retry on error.

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useRole } from '@/lib/auth';
import { useExportJobAF360 } from '@/hooks/useExportJobAF360';
import type { JobDTO, CustomerDTO } from '@shared/types';

export function JobExportButton({
  job,
  customer,
}: {
  job: JobDTO;
  customer: CustomerDTO;
}) {
  const role = useRole();
  const { phase, start, retryFromBatch, reset } = useExportJobAF360();
  const { toast } = useToast();

  // Surface success / error as toasts so the user gets feedback even if they
  // navigate away from the row's progress label.
  useEffect(() => {
    if (phase.kind === 'done') {
      toast({
        title: 'Export complete',
        description: `${phase.totalLots} lots / ${phase.totalPhotos} photos in ${phase.totalBatches + 1} files for ${customer.name} / ${job.jobNumber}`,
        variant: 'success',
      });
    } else if (phase.kind === 'error') {
      toast({
        title: phase.failedBatchNum
          ? `Batch ${phase.failedBatchNum} failed`
          : 'Export failed',
        description: phase.message,
        variant: 'danger',
      });
    }
  }, [phase, customer.name, job.jobNumber, toast]);

  // Warehouse can't export — they don't manage auctions.
  if (role === 'warehouse') return null;

  const inProgress = phase.kind === 'starting' || phase.kind === 'batch';

  if (phase.kind === 'error') {
    // failedBatchNum is set only when /batch failed mid-export (ctxRef has
    // the plan; resume from that batch). For /start failures (NO_LOTS,
    // SELLER_CODE_REQUIRED, etc.) failedBatchNum is null and ctxRef was
    // never populated — retryFromBatch would no-op. Re-call start() instead
    // so the full flow re-runs and the error toast useEffect re-fires.
    const onRetry = phase.failedBatchNum != null
      ? () => retryFromBatch()
      : () => start(job.id);
    return (
      <div className="flex items-center gap-2">
        <Button size="sm" variant="destructive" onClick={onRetry}>
          {phase.failedBatchNum ? `Retry batch ${phase.failedBatchNum}` : 'Retry export'}
        </Button>
        <Button size="sm" variant="ghost" onClick={reset}>Cancel</Button>
      </div>
    );
  }

  if (phase.kind === 'starting') {
    return <Button size="sm" disabled>Preparing export…</Button>;
  }

  if (phase.kind === 'batch') {
    const verb = phase.sub === 'building' ? 'Building' : 'Downloading';
    return (
      <Button size="sm" disabled>
        {verb} batch {phase.batchNum} of {phase.totalBatches}…
      </Button>
    );
  }

  if (phase.kind === 'done') {
    // Auto-reset to idle after 5s so subsequent clicks work.
    return (
      <DoneButton onReset={reset}>Export complete</DoneButton>
    );
  }

  // Strict gate: enable only when every lot in the job is in 'assigned'
  // state AND has title + description + price populated. Partial-export is
  // a poor fit since we don't track which lots have already been exported
  // — re-running the export on a partially-cataloged or partially-sold
  // job creates listing duplicates and confusion. A job mid-cataloging
  // (some lots not yet assigned) or post-auction (some lots sold) keeps
  // the button disabled with an explanatory tooltip.
  //
  // totalLotCount/exportReadyLotCount may be undefined when a stale
  // JobDTO is in cache (legacy shape); treat undefined as "unknown,
  // allow click" so we don't regress when caches don't carry the counts.
  const total = job.totalLotCount;
  const ready = job.exportReadyLotCount;
  const notReady =
    total !== undefined && ready !== undefined && (total === 0 || ready !== total);

  return (
    <Button
      size="sm"
      onClick={() => start(job.id)}
      disabled={inProgress || notReady}
      title={
        notReady
          ? 'Job has lots that are not assigned or are missing title/description/price'
          : undefined
      }
    >
      Export to AF360
    </Button>
  );
}

function DoneButton({ children, onReset }: { children: React.ReactNode; onReset: () => void }) {
  useEffect(() => {
    const t = setTimeout(onReset, 5000);
    return () => clearTimeout(t);
  }, [onReset]);
  return <Button size="sm" variant="outline" disabled>{children}</Button>;
}
