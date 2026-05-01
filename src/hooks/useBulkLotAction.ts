// src/hooks/useBulkLotAction.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { LotState } from '@shared/types';

export type BulkResult =
  | { id: string; ok: true }
  | { id: string; ok: false; error: { code: string; message: string } };

export type BulkAction =
  | { action: 'change-state'; lotIds: string[]; params: { to: LotState } }
  | { action: 'move'; lotIds: string[]; params: { destinationJobId: string } }
  | { action: 'delete'; lotIds: string[] };

export function useBulkLotAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (action: BulkAction) =>
      api<{ results: BulkResult[] }>('/lots/bulk', { method: 'POST', body: JSON.stringify(action) }),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['lots'] });
      qc.invalidateQueries({ queryKey: ['lot'] });
    },
  });
}
