// src/hooks/useAiBacklog.ts
// Mutation for POST /api/ai/backlog (Run Now button — no ?source=cron).
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useToast } from '@/components/ui/toast';
import type { AiBacklogResponse } from '@shared/types';

export function useAiBacklog() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation<AiBacklogResponse, Error, void>({
    mutationFn: () => api<AiBacklogResponse>('/ai/backlog', { method: 'POST' }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['lots-infinite'] });
      qc.invalidateQueries({ queryKey: ['system-settings'] });
      // Run Now invocations can run for several minutes (web_search-heavy
      // lots take 60-180s each); the operator may not be looking at Settings
      // when the call returns. Persist completion toasts longer than the
      // 5s default so they're still on screen when attention returns.
      if ('skipped' in data) {
        if (data.reason === 'in_progress') {
          toast({ title: 'AI run already in progress', description: 'Try again in a moment.', variant: 'warning', durationMs: 30000 });
        } else if (data.reason === 'disabled') {
          toast({ title: 'AI is disabled', description: 'Enable it in Settings → AI → Schedule.', variant: 'warning', durationMs: 30000 });
        } else {
          toast({ title: 'Skipped', description: 'Schedule says it is too soon for the next run.', variant: 'info', durationMs: 30000 });
        }
        return;
      }
      const { processed, remaining } = data;
      if (processed === 0 && remaining === 0) {
        toast({ title: 'No lots are pending AI processing.', variant: 'info', durationMs: 30000 });
      } else if (remaining === 0) {
        toast({ title: `Processed ${processed} lots. Backlog cleared.`, variant: 'success', durationMs: 30000 });
      } else {
        toast({
          title: `Processed ${processed} lots.`,
          description: `${remaining} remaining — click Run Now again or wait for the next scheduled run.`,
          variant: 'info',
          durationMs: 30000,
        });
      }
    },
    onError: (err) => {
      toast({ title: 'Could not start AI run', description: err.message, variant: 'danger', durationMs: 60000 });
    },
  });
}
