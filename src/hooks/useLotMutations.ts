// src/hooks/useLotMutations.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { LotDTO, LotState } from '@shared/types';

type UpdateInput = Partial<{
  title: string | null;
  description: string | null;
  price: string | null;
  quantity: number;
  ref1: string | null;
  ref2: string | null;
  specialNotesCategory: 'None' | 'TOOL ONLY' | 'READ' | 'CLOTHING';
  specialNotesText: string | null;
  untested: boolean;
}>;

function patchLot(id: string, body: unknown) {
  return api<LotDTO>(`/lots/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
}

export function useUpdateLot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateInput }) => patchLot(id, input),
    onMutate: async ({ id, input }) => {
      await qc.cancelQueries({ queryKey: ['lot', id] });
      const previous = qc.getQueryData<LotDTO>(['lot', id]);
      if (previous) qc.setQueryData(['lot', id], { ...previous, ...input });
      return { previous };
    },
    onError: (_err, { id }, ctx) => {
      if (ctx?.previous) qc.setQueryData(['lot', id], ctx.previous);
    },
    onSettled: (_data, _err, { id }) => {
      qc.invalidateQueries({ queryKey: ['lot', id] });
      qc.invalidateQueries({ queryKey: ['lots'] });
    },
  });
}

export function useChangeLotState() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, to }: { id: string; to: LotState }) => patchLot(id, { state: to }),
    onMutate: async ({ id, to }) => {
      await qc.cancelQueries({ queryKey: ['lot', id] });
      const previous = qc.getQueryData<LotDTO>(['lot', id]);
      if (previous) qc.setQueryData(['lot', id], { ...previous, state: to });
      return { previous };
    },
    onError: (_err, { id }, ctx) => {
      if (ctx?.previous) qc.setQueryData(['lot', id], ctx.previous);
    },
    onSettled: (_data, _err, { id }) => {
      qc.invalidateQueries({ queryKey: ['lot', id] });
      qc.invalidateQueries({ queryKey: ['lots'] });
    },
  });
}

export function useMoveLot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, destinationJobId }: { id: string; destinationJobId: string }) =>
      api<LotDTO>(`/lots/${id}/move`, { method: 'POST', body: JSON.stringify({ destinationJobId }) }),
    onSettled: (_data, _err, { id }) => {
      qc.invalidateQueries({ queryKey: ['lot', id] });
      qc.invalidateQueries({ queryKey: ['lots'] });
    },
  });
}

export function useDeleteLot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<{ ok: true }>(`/lots/${id}`, { method: 'DELETE' }),
    onSettled: () => qc.invalidateQueries({ queryKey: ['lots'] }),
  });
}
