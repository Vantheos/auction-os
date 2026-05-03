// tests/client/hooks/useBulkLotAction.test.tsx
// C2 of the Phase 3.5 backfill.
//
// After a bulk mutation settles, BOTH ['lot'] (covers any open lot-detail
// modal observing ['lot', id]) and ['lots-infinite'] (the inventory list)
// must invalidate. Hierarchical queryKey matching means ['lot'] catches
// every ['lot', anyId] query.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, waitFor } from '@testing-library/react';
import { useBulkLotAction } from '@/hooks/useBulkLotAction';
import { renderHookWithProviders } from '../../helpers/render-with-providers';
import { mockApi, resetMockApi } from '../../helpers/mock-api';
import { makeLot } from '../../helpers/fixtures';

vi.mock('@/lib/api', async () => ({
  api: (await import('../../helpers/mock-api')).apiMockImpl,
}));

beforeEach(() => resetMockApi());

describe('useBulkLotAction', () => {
  it('C2 — invalidates ["lot"] (any open modal) and ["lots-infinite"] on settle', async () => {
    mockApi({
      'POST /lots/bulk': () => ({
        results: [
          { id: 'a', ok: true },
          { id: 'b', ok: true },
        ],
      }),
    });

    const { result, queryClient } = renderHookWithProviders(() => useBulkLotAction());

    // Seed queries that should be invalidated
    queryClient.setQueryData(['lot', 'a'], makeLot({ id: 'a' }));
    queryClient.setQueryData(['lot', 'b'], makeLot({ id: 'b' }));
    queryClient.setQueryData(['lots-infinite', {}], { pages: [], pageParams: [] });
    queryClient.setQueryData(['lots-infinite', { state: ['unassigned'] }], {
      pages: [],
      pageParams: [],
    });

    act(() => {
      result.current.mutate({
        action: 'change-state',
        lotIds: ['a', 'b'],
        params: { to: 'sold' },
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(queryClient.getQueryState(['lot', 'a'])?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(['lot', 'b'])?.isInvalidated).toBe(true);
    expect(
      queryClient
        .getQueryCache()
        .findAll({ queryKey: ['lots-infinite'] })
        .every((q) => q.state.isInvalidated),
    ).toBe(true);
  });
});
