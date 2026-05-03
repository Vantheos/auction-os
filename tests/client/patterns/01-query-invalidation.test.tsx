// tests/client/patterns/01-query-invalidation.test.tsx
//
// PATTERN: A mutation invalidates the right queryKey, causing a list query to
// refetch. This is the regression contract that bit T-A6/A8/A10 in Phase 3,
// where mutation hooks invalidated `['lots']` while the list hook used
// `['lots-infinite']` — silent miss, list never refetched.
//
// HOW TO ADAPT for a real hook:
//   - Replace `useToyList` / `useToyMutation` with the real query / mutation
//     hooks under test.
//   - Replace `'GET /toys'` / `'POST /toys'` with the real endpoints.
//   - Assert against the real visible DOM after the mutation.
// The structural moves (count fetches → click → re-count) stay the same.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { api } from '@/lib/api';
import { renderWithProviders } from '../../helpers/render-with-providers';
import { mockApi, resetMockApi } from '../../helpers/mock-api';

vi.mock('@/lib/api', async () => ({
  api: (await import('../../helpers/mock-api')).apiMockImpl,
}));

beforeEach(() => resetMockApi());

// --- Synthetic toy hooks ----------------------------------------------------

type Toy = { id: string; name: string };

function useToyList() {
  return useQuery({
    queryKey: ['toy-list'],
    queryFn: () => api<{ items: Toy[] }>('/toys'),
  });
}

function useAddToy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      api<Toy>('/toys', { method: 'POST', body: JSON.stringify({ name }) }),
    // The line under test: invalidate the SAME queryKey the list uses.
    // If this drifts (e.g. ['toys'] vs ['toy-list']), the regression below
    // will catch it.
    onSettled: () => qc.invalidateQueries({ queryKey: ['toy-list'] }),
  });
}

function ToyComponent() {
  const list = useToyList();
  const add = useAddToy();
  return (
    <div>
      <ul>
        {list.data?.items.map((it) => (
          <li key={it.id}>{it.name}</li>
        ))}
      </ul>
      <button type="button" onClick={() => add.mutate('new')}>
        Add
      </button>
    </div>
  );
}

// --- Tests ------------------------------------------------------------------

describe('PATTERN — query invalidation after mutation', () => {
  it('refetches the list when the mutation settles', async () => {
    let listFetches = 0;
    mockApi({
      'GET /toys': () => {
        listFetches++;
        return { items: listFetches === 1 ? [] : [{ id: '1', name: 'new' }] };
      },
      'POST /toys': () => ({ id: '1', name: 'new' }),
    });

    const user = userEvent.setup();
    renderWithProviders(<ToyComponent />);

    await waitFor(() => expect(listFetches).toBe(1));

    await user.click(screen.getByRole('button', { name: 'Add' }));

    // The contract: after the mutation settles, the list refetches.
    await waitFor(() => expect(listFetches).toBe(2));
    expect(await screen.findByText('new')).toBeInTheDocument();
  });
});
