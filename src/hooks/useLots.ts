// src/hooks/useLots.ts
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { LotDTO, LotPhotoDTO } from '@shared/types';

export function useLot(id: string | undefined) {
  return useQuery({
    queryKey: ['lot', id],
    queryFn: () => api<LotDTO>(`/lots/${id}`),
    enabled: !!id,
  });
}

export function useLotPhotos(lotId: string | undefined) {
  return useQuery({
    queryKey: ['lot-photos', lotId],
    queryFn: () => api<{ photos: LotPhotoDTO[] }>(`/lots/${lotId}/photos`).then((r) => r.photos),
    enabled: !!lotId,
  });
}
