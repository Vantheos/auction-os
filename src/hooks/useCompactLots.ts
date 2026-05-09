// src/hooks/useCompactLots.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type CompactMove = {
  lotId: string;
  oldNumber: number;
  newNumber: number;
};

export type CompactResponse = {
  moves: CompactMove[];
  renumbered: number;
};

/**
 * POST /api/jobs/:id/compact-lots — fills lot-number gaps with the
 * highest-numbered lots, marks each moved lot as needing a label
 * reprint. Invalidates the job query and the inventory list so the
 * modal sees the updated gap count and the inventory list shows the
 * Reprint pill on the moved lots.
 */
export function useCompactLots() {
  const qc = useQueryClient();
  return useMutation<CompactResponse, Error, { jobId: string }>({
    mutationFn: ({ jobId }) =>
      api<CompactResponse>(`/jobs/${jobId}/compact-lots`, { method: 'POST' }),
    onSuccess: (_data, { jobId }) => {
      // Invalidate the job query so totalLotCount + lotNumberGapCount
      // refresh in any open dialog. Also drop the lots list cache so
      // the Reprint pills appear in inventory.
      qc.invalidateQueries({ queryKey: ['job', jobId] });
      qc.invalidateQueries({ queryKey: ['jobs'] });
      qc.invalidateQueries({ queryKey: ['lots-infinite'] });
    },
  });
}
