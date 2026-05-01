// src/hooks/useLabelPrint.ts
import { useMutation } from '@tanstack/react-query';
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
