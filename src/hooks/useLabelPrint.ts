// src/hooks/useLabelPrint.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useToast } from '@/components/ui/toast';
import { useSystemSettings } from './useSystemSettings';

async function postZpl(helperUrl: string, zpl: string): Promise<void> {
  const r = await fetch(`${helperUrl.replace(/\/$/, '')}/write`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: zpl,
  });
  if (!r.ok) throw new Error(`Browser Print returned ${r.status}`);
}

export function useLabelPrint() {
  const { toast } = useToast();
  const { data: settings } = useSystemSettings();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (lotId: string) => {
      const helperUrl = settings?.labelPrinterHelperUrl;
      if (!helperUrl) throw new Error('NO_HELPER_URL');
      const { zpl } = await api<{ zpl: string }>('/labels/render', {
        method: 'POST',
        body: JSON.stringify({ lotId }),
      });
      await postZpl(helperUrl, zpl);
    },
    // Invalidate on settle (success OR error). The server clears the
    // lot's label_reprint_needed flag the moment /api/labels/render
    // succeeds — which happens BEFORE the Browser Print POST — so the
    // flag is cleared even when the printer is unreachable. Without
    // this, the inventory Reprint pill would stay visible until a
    // navigation forced a refetch, even though the server-side state
    // had already updated.
    onSettled: (_data, _err, lotId) => {
      qc.invalidateQueries({ queryKey: ['lots-infinite'] });
      qc.invalidateQueries({ queryKey: ['lot', lotId] });
    },
    onSuccess: () => toast({ title: 'Label sent to printer', variant: 'success' }),
    onError: (err: Error) => {
      if (err.message === 'NO_HELPER_URL') {
        toast({
          title: 'Printer not configured',
          description: 'Set the helper URL in Settings → Label printer.',
          variant: 'warning',
        });
        return;
      }
      toast({
        title: 'Label print failed',
        description: err.message,
        variant: 'warning',
        actionLabel: 'Retry',
      });
    },
  });
}
