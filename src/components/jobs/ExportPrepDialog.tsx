// src/components/jobs/ExportPrepDialog.tsx
//
// Pre-export modal that opens when the operator clicks Export to AF360.
// Surfaces two readiness checks before the export actually fires:
//
//   1. Field-completeness — every assigned lot must have title +
//      description + price. Mirrors the existing button gate.
//   2. Lot-number sequence — gaps from deleted / moved-out lots break
//      the sequential sequence the auction platform expects. Operator
//      can compact in-place (highest lots fill lowest gaps) or proceed
//      with gaps.
//
// The same dialog is used by both the Inventory Export button and the
// Customer detail Job export button — they share JobExportButton, which
// owns the dialog open state.

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useCompactLots } from '@/hooks/useCompactLots';
import type { JobDTO, CustomerDTO } from '@shared/types';

type Props = {
  open: boolean;
  onClose: () => void;
  job: JobDTO;
  customer: CustomerDTO;
  // Fired when the operator commits to running the export. The modal
  // closes itself before invoking; the parent owns the actual flow.
  onConfirmExport: () => void;
};

export function ExportPrepDialog({ open, onClose, job, customer, onConfirmExport }: Props) {
  const { toast } = useToast();
  const compact = useCompactLots();
  // True after a successful compact in this session — used to switch the
  // tone from "you have gaps" to "compact succeeded" without forcing a
  // full re-render path.
  const [compactedThisSession, setCompactedThisSession] = useState(false);

  const total = job.totalLotCount ?? 0;
  const ready = job.exportReadyLotCount ?? 0;
  const gaps = job.lotNumberGapCount ?? 0;
  const fieldsReady = total > 0 && ready === total;
  const hasGaps = gaps > 0;

  const onCompact = () => {
    compact.mutate({ jobId: job.id }, {
      onSuccess: (data) => {
        setCompactedThisSession(true);
        toast({
          title: `Compacted ${data.renumbered} lot${data.renumbered === 1 ? '' : 's'}`,
          description: data.renumbered > 0
            ? 'Affected lots are flagged "Reprint" — print fresh labels before shipping.'
            : 'No gaps to compact.',
          variant: 'success',
          durationMs: 30000,
        });
      },
      onError: (err) => {
        toast({
          title: 'Compact failed',
          description: err.message,
          variant: 'danger',
          durationMs: 60000,
        });
      },
    });
  };

  const onExport = () => {
    onClose();
    onConfirmExport();
  };

  // Render guards. Each branch composes the body + footer for one of
  // four states:
  //   - missing fields → no export action available
  //   - gaps + ready fields, pre-compact → Compact (recommended) + Export with gaps
  //   - gaps + ready fields, post-compact-with-residual (rare) → same shape
  //   - no gaps + ready fields → Export + Cancel
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Export {customer.name} / {job.jobNumber}?</DialogTitle>
          <DialogDescription>
            Review readiness before the AF360 export starts. Both this dialog
            and the resulting file go to the auction platform.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <ReadinessRow
            label="Field completeness"
            ok={fieldsReady}
            okText={`All ${total} assigned lot${total === 1 ? '' : 's'} have title, description, and price.`}
            warnText={
              total === 0
                ? 'No assigned lots in this job yet — nothing to export.'
                : `${total - ready} of ${total} assigned lot${total === 1 ? '' : 's'} ${total - ready === 1 ? 'is' : 'are'} missing title, description, or price.`
            }
          />
          <ReadinessRow
            label="Lot-number sequence"
            ok={!hasGaps}
            okText="Lot numbers are sequential — no gaps."
            warnText={`${gaps} gap${gaps === 1 ? '' : 's'} in the sequence (deleted or moved-out lots). The auction platform expects sequential lot numbers; consider compacting before export.`}
          />
          {compactedThisSession && hasGaps && (
            <p className="text-xs text-textDim">
              The sequence still has gaps after compact. This usually means
              there are no remaining higher-numbered lots to fill them — the
              gaps are at the bottom of the sequence rather than the middle.
              Export with gaps if you accept the auction-platform implications.
            </p>
          )}
        </div>

        <DialogFooter className="gap-2 flex-wrap">
          <Button variant="outline" onClick={onClose} disabled={compact.isPending}>
            Cancel
          </Button>
          {!fieldsReady && (
            <span className="text-xs text-textDim ml-auto">
              Fix the field-completeness issue, then re-open this dialog.
            </span>
          )}
          {fieldsReady && hasGaps && (
            <Button
              variant="outline"
              onClick={onCompact}
              disabled={compact.isPending}
              title="Move the highest-numbered lots into the gaps. Affected labels will need to be reprinted."
            >
              {compact.isPending ? 'Compacting…' : 'Compact lot numbers'}
            </Button>
          )}
          {fieldsReady && hasGaps && (
            <Button variant="destructive" onClick={onExport} disabled={compact.isPending}>
              Export with gaps
            </Button>
          )}
          {fieldsReady && !hasGaps && (
            <Button onClick={onExport}>
              Export to AF360
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReadinessRow({
  label, ok, okText, warnText,
}: {
  label: string;
  ok: boolean;
  okText: string;
  warnText: string;
}) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-md border border-border bg-surfaceAlt">
      <span
        className={`mt-0.5 size-2 rounded-full flex-shrink-0 ${ok ? 'bg-success' : 'bg-warning'}`}
        aria-hidden
      />
      <div className="flex-1">
        <div className="text-xs font-semibold uppercase tracking-wide text-textDim mb-1">{label}</div>
        <div className="text-sm text-text">{ok ? okText : warnText}</div>
      </div>
    </div>
  );
}
