// src/hooks/useBulkLabelPrint.ts
//
// Phase 7. Serial bulk-label-print orchestration. Mirrors useLabelPrint's
// render-then-send-to-Browser-Print pattern but consolidates feedback
// into:
//   1. A single static "Sending N labels to the printer" toast held for
//      the duration of the loop. Wording is intentionally "Sending," not
//      "Printing" — Browser Print's 200 means "ZPL accepted," not "label
//      produced," so we don't claim per-iteration progress we can't
//      verify. The toast is a "system is alive" signal during the ~15s
//      window for a 30-lot batch.
//   2. The caller awaits mutateAsync() and opens BulkPrintVerifyDialog
//      with the {sentCount, failedCount} from the resolved value. The
//      hook stays free of UI side effects beyond the static toast it
//      owns.
//
// Per-lot failures (Browser Print unreachable, render endpoint 5xx) are
// tallied; the loop continues. Cache invalidation fires once on settle
// (not per-lot) to avoid 30 sequential refetches.
//
// Device discovery (/available) runs once before the loop, then each
// per-lot send reuses the same device — avoids hitting /available 30
// times for a 30-lot batch.

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useToast } from '@/components/ui/toast';
import { useSystemSettings } from './useSystemSettings';
import { discoverPrinter, sendZpl, NO_PRINTER } from '@/lib/browser-print';

export type BulkPrintResult = { sentCount: number; failedCount: number };

export function useBulkLabelPrint() {
  const { toast, dismiss } = useToast();
  const { data: settings } = useSystemSettings();
  const qc = useQueryClient();

  return useMutation<BulkPrintResult, Error, string[]>({
    mutationFn: async (lotIds) => {
      const helperUrl = settings?.labelPrinterHelperUrl;
      if (!helperUrl) throw new Error('NO_HELPER_URL');
      if (lotIds.length === 0) return { sentCount: 0, failedCount: 0 };

      // Discover the printer once before the loop. If discovery fails,
      // the loop can't usefully proceed — surface the error via onError.
      const device = await discoverPrinter(helperUrl);

      const toastId = toast({
        title: `Sending ${lotIds.length} labels to the printer`,
        durationMs: 0,
      });

      let sentCount = 0;
      let failedCount = 0;
      try {
        for (const lotId of lotIds) {
          try {
            const { zpl } = await api<{ zpl: string }>('/labels/render', {
              method: 'POST',
              body: JSON.stringify({ lotId }),
            });
            await sendZpl(helperUrl, device, zpl);
            sentCount += 1;
          } catch {
            // Per-lot failure — render 5xx, helper unreachable, etc.
            // Continue the loop; the verify-popup will tell the operator.
            failedCount += 1;
          }
        }
      } finally {
        dismiss(toastId);
      }

      return { sentCount, failedCount };
    },
    onSettled: () => {
      // Single invalidation for the whole batch, not per-lot.
      qc.invalidateQueries({ queryKey: ['lots-infinite'] });
    },
    onError: (err: Error) => {
      if (err.message === 'NO_HELPER_URL') {
        toast({
          title: 'Printer not configured',
          description: 'Set the helper URL in Settings → Label printer.',
          variant: 'warning',
        });
        return;
      }
      if (err.message === NO_PRINTER) {
        toast({
          title: 'No printer detected',
          description: 'Browser Print is reachable but no printer is connected.',
          variant: 'warning',
        });
        return;
      }
      // Other discovery failures (HTTP error from /available) — surface
      // the message so the operator can diagnose.
      toast({
        title: 'Bulk print failed',
        description: err.message,
        variant: 'warning',
      });
    },
  });
}
