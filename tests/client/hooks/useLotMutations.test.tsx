// tests/client/hooks/useLotMutations.test.tsx
// C1 + C3 of the Phase 3.5 backfill.
//
// C1 — invalidation: each of the four single-lot mutation hooks invalidates
// the queryKeys the inventory list and the open-modal lot query observe.
// The Phase 3 regression (T-A6/A8/A10) was that mutations invalidated
// `['lots']` while the list hook used `['lots-infinite']`; the list never
// refetched. These tests pin the pair: ['lot', id] AND ['lots-infinite']
// after every settled single-lot mutation (delete only invalidates the
// list — the lot is gone).
//
// C3 — optimistic + rollback: useUpdateLot and useChangeLotState both
// optimistically write to ['lot', id] in onMutate, capture the previous
// value, and roll back in onError. onSettled invalidates regardless.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, waitFor } from '@testing-library/react';
import {
  useUpdateLot,
  useChangeLotState,
  useMoveLot,
  useDeleteLot,
} from '@/hooks/useLotMutations';
import { renderHookWithProviders } from '../../helpers/render-with-providers';
import { mockApi, resetMockApi } from '../../helpers/mock-api';
import { makeLot } from '../../helpers/fixtures';

vi.mock('@/lib/api', async () => ({
  api: (await import('../../helpers/mock-api')).apiMockImpl,
}));

beforeEach(() => resetMockApi());

// Helper: assert both invalidation targets fired. Without an observer on
// either query, isInvalidated stays true after invalidateQueries — that's
// our marker.
function expectBothInvalidated(qc: import('@tanstack/react-query').QueryClient, lotId: string) {
  expect(qc.getQueryState(['lot', lotId])?.isInvalidated).toBe(true);
  expect(
    qc
      .getQueryCache()
      .findAll({ queryKey: ['lots-infinite'] })
      .every((q) => q.state.isInvalidated),
  ).toBe(true);
}

function seedQueriesFor(qc: import('@tanstack/react-query').QueryClient, lotId: string) {
  qc.setQueryData(['lot', lotId], makeLot({ id: lotId }));
  qc.setQueryData(['lots-infinite', {}], { pages: [], pageParams: [] });
}

describe('useUpdateLot', () => {
  it('C1 — invalidates ["lot", id] and ["lots-infinite"] on settle', async () => {
    mockApi({ 'PATCH /lots/abc': () => makeLot({ id: 'abc', title: 'updated' }) });
    const { result, queryClient } = renderHookWithProviders(() => useUpdateLot());
    seedQueriesFor(queryClient, 'abc');

    act(() => {
      result.current.mutate({ id: 'abc', input: { title: 'updated' } });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expectBothInvalidated(queryClient, 'abc');
  });

  it('C3 — optimistic write, rollback on server error, invalidate regardless', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    mockApi({
      'PATCH /lots/abc': async () => {
        await gate;
        throw new Error('boom');
      },
    });

    const { result, queryClient } = renderHookWithProviders(() => useUpdateLot());
    seedQueriesFor(queryClient, 'abc');

    act(() => {
      result.current.mutate({ id: 'abc', input: { title: 'optimistic' } });
    });

    // Optimistic write lands before server resolves
    await waitFor(() =>
      expect(queryClient.getQueryData<{ title: string }>(['lot', 'abc'])?.title).toBe(
        'optimistic',
      ),
    );

    release();
    await waitFor(() => expect(result.current.isError).toBe(true));

    // Rollback to seeded value (title was null)
    expect(queryClient.getQueryData<{ title: string | null }>(['lot', 'abc'])?.title).toBe(
      null,
    );
    expectBothInvalidated(queryClient, 'abc');
  });
});

describe('useChangeLotState', () => {
  it('C1 — invalidates ["lot", id] and ["lots-infinite"] on settle', async () => {
    mockApi({ 'PATCH /lots/abc': () => makeLot({ id: 'abc', state: 'sold' }) });
    const { result, queryClient } = renderHookWithProviders(() => useChangeLotState());
    seedQueriesFor(queryClient, 'abc');

    act(() => {
      result.current.mutate({ id: 'abc', to: 'sold' });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expectBothInvalidated(queryClient, 'abc');
  });

  it('C3 — optimistic state flip, rollback on server error, invalidate regardless', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    mockApi({
      'PATCH /lots/abc': async () => {
        await gate;
        throw new Error('boom');
      },
    });

    const { result, queryClient } = renderHookWithProviders(() => useChangeLotState());
    seedQueriesFor(queryClient, 'abc');
    // Confirm seed state is unassigned
    expect(queryClient.getQueryData<{ state: string }>(['lot', 'abc'])?.state).toBe(
      'unassigned',
    );

    act(() => {
      result.current.mutate({ id: 'abc', to: 'sold' });
    });

    await waitFor(() =>
      expect(queryClient.getQueryData<{ state: string }>(['lot', 'abc'])?.state).toBe(
        'sold',
      ),
    );

    release();
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(queryClient.getQueryData<{ state: string }>(['lot', 'abc'])?.state).toBe(
      'unassigned',
    );
    expectBothInvalidated(queryClient, 'abc');
  });
});

describe('useMoveLot', () => {
  it('C1 — invalidates ["lot", id] and ["lots-infinite"] on settle', async () => {
    mockApi({
      'POST /lots/abc/move': () => makeLot({ id: 'abc', state: 'assigned' }),
    });
    const { result, queryClient } = renderHookWithProviders(() => useMoveLot());
    seedQueriesFor(queryClient, 'abc');

    act(() => {
      result.current.mutate({ id: 'abc', destinationJobId: 'job-9' });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expectBothInvalidated(queryClient, 'abc');
  });
});

describe('useDeleteLot', () => {
  it('C1 — invalidates ["lots-infinite"] on settle (lot is gone, no per-lot key)', async () => {
    mockApi({ 'DELETE /lots/abc': () => ({ ok: true as const }) });
    const { result, queryClient } = renderHookWithProviders(() => useDeleteLot());
    seedQueriesFor(queryClient, 'abc');

    act(() => {
      result.current.mutate('abc');
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(
      queryClient
        .getQueryCache()
        .findAll({ queryKey: ['lots-infinite'] })
        .every((q) => q.state.isInvalidated),
    ).toBe(true);
  });
});
