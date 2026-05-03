// tests/client/patterns/02-optimistic-update-rollback.test.tsx
//
// PATTERN: A mutation with an optimistic update writes to the cache in
// `onMutate`, rolls back to the captured previous value in `onError`, and
// invalidates regardless in `onSettled`. Three behaviors in one test because
// they're three faces of the same hook contract — splitting them buys nothing
// and risks letting one slip while you assert the other two.
//
// Note the deliberate delay between the optimistic write and the rejection.
// If the mutationFn throws synchronously, onError fires before any waitFor
// can observe the optimistic cache state — the rollback wins the race. The
// pending promise pattern below pauses the rejection until after we've
// asserted the optimistic value, then releases it for the rollback assertion.
//
// HOW TO ADAPT for a real hook:
//   - Replace `useUpdateToyItem` with the real mutation hook.
//   - Seed the cache with the real query's expected shape.
//   - Adjust the `previous` capture / restore to match the real onMutate logic.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { act, waitFor } from '@testing-library/react';
import { api } from '@/lib/api';
import { renderHookWithProviders } from '../../helpers/render-with-providers';
import { mockApi, resetMockApi } from '../../helpers/mock-api';

vi.mock('@/lib/api', async () => ({
  api: (await import('../../helpers/mock-api')).apiMockImpl,
}));

beforeEach(() => resetMockApi());

// --- Synthetic toy hook -----------------------------------------------------

type ToyItem = { id: string; name: string };

function useUpdateToyItem(id: string) {
  const qc = useQueryClient();
  return useMutation<ToyItem, Error, { name: string }, { previous?: ToyItem }>({
    mutationFn: (data) =>
      api<ToyItem>(`/toy-item/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    onMutate: async (data) => {
      await qc.cancelQueries({ queryKey: ['toy-item', id] });
      const previous = qc.getQueryData<ToyItem>(['toy-item', id]);
      qc.setQueryData<ToyItem | undefined>(['toy-item', id], (prev) =>
        prev ? { ...prev, ...data } : prev,
      );
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) {
        qc.setQueryData(['toy-item', id], ctx.previous);
      }
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['toy-item', id] }),
  });
}

// --- Tests ------------------------------------------------------------------

describe('PATTERN — optimistic update + rollback + invalidate', () => {
  it('writes optimistic value, rolls back on server error, marks invalidated', async () => {
    let releaseRejection: () => void = () => {};
    const rejectionGate = new Promise<void>((resolve) => {
      releaseRejection = resolve;
    });

    mockApi({
      'PATCH /toy-item/a': async () => {
        await rejectionGate;
        throw new Error('server rejected');
      },
    });

    const { result, queryClient } = renderHookWithProviders(() =>
      useUpdateToyItem('a'),
    );

    // Seed the cache with the "current" server value.
    queryClient.setQueryData<ToyItem>(['toy-item', 'a'], {
      id: 'a',
      name: 'original',
    });

    act(() => {
      result.current.mutate({ name: 'optimistic' });
    });

    // 1. Optimistic write: cache flips before the server resolves.
    await waitFor(() =>
      expect(queryClient.getQueryData<ToyItem>(['toy-item', 'a'])?.name).toBe(
        'optimistic',
      ),
    );

    // Release the gate; rejection now propagates to onError.
    releaseRejection();

    // 2. Wait for the failure to land.
    await waitFor(() => expect(result.current.isError).toBe(true));

    // 3. Rollback: cache is back to the captured previous value.
    expect(queryClient.getQueryData<ToyItem>(['toy-item', 'a'])?.name).toBe(
      'original',
    );

    // 4. Invalidation: onSettled fired. With no observer on the query, no
    //    refetch happens, so isInvalidated stays true — that's the marker.
    expect(queryClient.getQueryState(['toy-item', 'a'])?.isInvalidated).toBe(
      true,
    );
  });
});
