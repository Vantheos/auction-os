// src/hooks/useAiRun.ts
// Mutation for POST /api/ai/run (single-lot manual trigger).
// Follows the canonical hook pattern from Phase 3.5 testing-policy:
// uses the api() client (which throws on non-OK), invalidates the
// affected queries on success, and surfaces toasts via useToast.

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useToast } from '@/components/ui/toast';
import type { LotDTO } from '@shared/types';

type Variables = { lotId: string };

export function useAiRun() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation<LotDTO, Error, Variables>({
    mutationFn: ({ lotId }) =>
      api<LotDTO>('/ai/run', {
        method: 'POST',
        body: JSON.stringify({ lotId }),
      }),
    onSuccess: (lot) => {
      qc.invalidateQueries({ queryKey: ['lot', lot.id] });
      qc.invalidateQueries({ queryKey: ['lots-infinite'] });
      const status = lot.lastAiRunStatus;
      if (status === 'success') toast({ title: 'AI generation complete', variant: 'success' });
      else if (status === 'partial') toast({ title: 'AI generation: partial result', description: lot.lastAiRunError ?? '', variant: 'warning' });
      else toast({ title: 'AI generation failed', description: lot.lastAiRunError ?? '', variant: 'danger' });
    },
    onError: (err) => {
      toast({ title: 'Could not run AI', description: err.message, variant: 'danger' });
    },
  });
}
