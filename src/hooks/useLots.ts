// src/hooks/useLots.ts
import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { LotDTO, LotPhotoDTO, LotsListResponse, LotState } from '@shared/types';

export type LotFilters = {
  customerId?: string;
  jobId?: string;
  state?: LotState[];
  limit?: number;
  offset?: number;
};

function toQueryString(f: LotFilters): string {
  const p = new URLSearchParams();
  if (f.customerId) p.set('customerId', f.customerId);
  if (f.jobId) p.set('jobId', f.jobId);
  if (f.state) for (const s of f.state) p.append('state', s);
  if (f.limit !== undefined) p.set('limit', String(f.limit));
  if (f.offset !== undefined) p.set('offset', String(f.offset));
  const qs = p.toString();
  return qs ? `?${qs}` : '';
}

export function useLots(
  filters: LotFilters,
  options?: Omit<UseQueryOptions<LotsListResponse>, 'queryKey' | 'queryFn'>,
) {
  return useQuery({
    queryKey: ['lots', filters],
    queryFn: () => api<LotsListResponse>(`/lots${toQueryString(filters)}`),
    ...options,
  });
}

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
