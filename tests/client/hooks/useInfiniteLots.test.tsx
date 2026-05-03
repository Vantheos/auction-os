// tests/client/hooks/useInfiniteLots.test.tsx
// C5 of the Phase 3.5 backfill.
//
// The exact regression: useInfiniteLots queries `['lots-infinite', filters]`,
// and if a mutation invalidates the matching prefix, react-query's active-
// observer auto-refetch should fire. Phase 3's bug had the mutation hooks
// invalidating `['lots']` instead — no match, no refetch, list went stale.
//
// This test proves the contract end-to-end: an active useInfiniteLots
// observer refetches when the canonical prefix is invalidated. C1's
// invalidation tests cover the OTHER half (mutations DO invalidate the
// canonical prefix); C5 closes the loop by verifying the prefix is right.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { waitFor } from '@testing-library/react';
import { useInfiniteLots } from '@/hooks/useInfiniteLots';
import { renderHookWithProviders } from '../../helpers/render-with-providers';
import { mockApi, resetMockApi } from '../../helpers/mock-api';

vi.mock('@/lib/api', async () => ({
  api: (await import('../../helpers/mock-api')).apiMockImpl,
}));

beforeEach(() => resetMockApi());

describe('useInfiniteLots', () => {
  it('C5 — refetches when ["lots-infinite"] is invalidated', async () => {
    let fetchCount = 0;
    mockApi({
      'GET /lots': () => {
        fetchCount++;
        return { lots: [], total: 0 };
      },
    });

    const { queryClient } = renderHookWithProviders(() => useInfiniteLots({}));

    // Initial fetch on mount
    await waitFor(() => expect(fetchCount).toBe(1));

    // Any mutation that invalidates ['lots-infinite'] should land here.
    await queryClient.invalidateQueries({ queryKey: ['lots-infinite'] });

    await waitFor(() => expect(fetchCount).toBe(2));
  });
});
