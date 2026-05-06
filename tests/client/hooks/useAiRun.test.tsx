// tests/client/hooks/useAiRun.test.tsx
// Pattern: invalidation + error path per docs/testing-policy.md.
// Toast surface verification lives in the LotAiButton component test
// (uses withToaster: true to assert rendered toast text).

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, waitFor } from '@testing-library/react';
import { renderHookWithProviders } from '../../helpers/render-with-providers';
import { mockApi, resetMockApi } from '../../helpers/mock-api';
import { useAiRun } from '@/hooks/useAiRun';

vi.mock('@/lib/api', async () => ({
  api: (await import('../../helpers/mock-api')).apiMockImpl,
}));

beforeEach(() => resetMockApi());

const LOT_ID = '11111111-1111-1111-1111-111111111111';

describe('useAiRun', () => {
  it('invalidates ["lot", id], ["lots-infinite"], and ["system-settings"] on success', async () => {
    mockApi({
      'POST /ai/run': () => ({ id: LOT_ID, lastAiRunStatus: 'success', lastAiRunError: null }),
    });
    const { result, queryClient } = renderHookWithProviders(() => useAiRun());
    queryClient.setQueryData(['lot', LOT_ID], { id: LOT_ID });
    queryClient.setQueryData(['lots-infinite'], { pages: [] });
    queryClient.setQueryData(['system-settings'], { id: 1 });

    act(() => { result.current.mutate({ lotId: LOT_ID }); });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(queryClient.getQueryState(['lot', LOT_ID])?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(['lots-infinite'])?.isInvalidated).toBe(true);
    // /api/ai/run mutates AI cost counters on every call.
    expect(queryClient.getQueryState(['system-settings'])?.isInvalidated).toBe(true);
  });

  it('exposes the server error on HTTP failure', async () => {
    mockApi({
      'POST /ai/run': () => { throw new Error('Already processed'); },
    });
    const { result } = renderHookWithProviders(() => useAiRun());

    act(() => { result.current.mutate({ lotId: LOT_ID }); });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('Already processed');
  });

  it('still invalidates on partial / failure status (so UI re-fetches)', async () => {
    mockApi({
      'POST /ai/run': () => ({ id: LOT_ID, lastAiRunStatus: 'partial', lastAiRunError: 'price' }),
    });
    const { result, queryClient } = renderHookWithProviders(() => useAiRun());
    queryClient.setQueryData(['lot', LOT_ID], { id: LOT_ID });

    act(() => { result.current.mutate({ lotId: LOT_ID }); });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(queryClient.getQueryState(['lot', LOT_ID])?.isInvalidated).toBe(true);
  });
});
