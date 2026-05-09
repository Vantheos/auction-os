// src/hooks/useInfiniteLots.ts
// Paginated infinite-query replacement for useLots. Fetches lots in pages
// of 50, exposes a flattened list + a fetchNextPage action. Total still
// comes back per page; we use it to derive hasNextPage. Selection state
// in Inventory keeps working unchanged because lot.id is stable.

import { useInfiniteQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { LotDTO, LotsListResponse, LotState } from '@shared/types';

const PAGE_SIZE = 50;

export type InfiniteLotFilters = {
  customerId?: string;
  jobId?: string;
  state?: LotState[];
  // REQ-1 (2026-05-06): two independent passthrough flags for the
  // /lots GET endpoint. See InventoryFilters for semantics.
  awaitingAi?: boolean;
  needsReview?: boolean;
  // Free-text substring search; matches title OR description (ILIKE).
  // Already trimmed by the consumer; empty/undefined means no filter.
  search?: string;
  // label_reprint_needed=true; surfaces lots whose physical labels were
  // invalidated by a compact-lots run.
  reprintPending?: boolean;
};

function toQueryString(f: InfiniteLotFilters, offset: number): string {
  const p = new URLSearchParams();
  if (f.customerId) p.set('customerId', f.customerId);
  if (f.jobId) p.set('jobId', f.jobId);
  if (f.state) for (const s of f.state) p.append('state', s);
  if (f.awaitingAi) p.set('awaitingAi', 'true');
  if (f.needsReview) p.set('needsReview', 'true');
  if (f.search) p.set('search', f.search);
  if (f.reprintPending) p.set('reprintPending', 'true');
  p.set('limit', String(PAGE_SIZE));
  p.set('offset', String(offset));
  return `?${p.toString()}`;
}

export function useInfiniteLots(filters: InfiniteLotFilters) {
  return useInfiniteQuery({
    queryKey: ['lots-infinite', filters] as const,
    queryFn: ({ pageParam }) =>
      api<LotsListResponse>(`/lots${toQueryString(filters, pageParam)}`),
    initialPageParam: 0 as number,
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((n, p) => n + p.lots.length, 0);
      return loaded < lastPage.total ? loaded : undefined;
    },
  });
}

/**
 * Convenience helper: flatten paginated pages into a single list. Most
 * callers only care about the row array; total comes from the last page.
 */
export function flattenLots(pages: { lots: LotDTO[]; total: number }[] | undefined): {
  lots: LotDTO[];
  total: number;
} {
  if (!pages || pages.length === 0) return { lots: [], total: 0 };
  return {
    lots: pages.flatMap((p) => p.lots),
    total: pages[pages.length - 1].total,
  };
}
