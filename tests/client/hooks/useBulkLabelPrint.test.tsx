// tests/client/hooks/useBulkLabelPrint.test.tsx
//
// Phase 7 area D. Verifies the serial bulk-print orchestration:
//   - prints fire in lotId order, one at a time
//   - per-lot failures (helper unreachable) are tallied; the loop continues
//   - NO_HELPER_URL aborts before any work
//   - cache invalidation fires once on settle, not per-lot
//   - the static "Sending N labels…" toast appears mid-loop and is
//     dismissed when the loop ends
//
// Mocks: api() via mock-api helper for /labels/render; global fetch for
// the Browser Print POST to {helperUrl}/write. useSystemSettings is
// satisfied by pre-seeding the query cache so the hook reads the helper
// URL synchronously (no fetch round-trip needed in tests).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import { QueryClient } from '@tanstack/react-query';
import { useBulkLabelPrint } from '@/hooks/useBulkLabelPrint';
import { createTestQueryClient, renderHookWithProviders } from '../../helpers/render-with-providers';
import { mockApi, resetMockApi, getApiCalls } from '../../helpers/mock-api';

vi.mock('@/lib/api', async () => ({
  api: (await import('../../helpers/mock-api')).apiMockImpl,
}));

const HELPER = 'http://localhost:9100';

function settings(helperUrl: string | null) {
  return {
    id: 1,
    labelPrinterHelperUrl: helperUrl,
    aiScheduleEnabled: false,
    aiScheduleIntervalHours: 24,
    aiScheduleTimeOfDay: '23:00:00',
    aiLastRunAt: null,
    aiCostMtdCents: 0,
    aiCostLifetimeCents: 0,
    aiRunCountLifetime: 0,
    aiCostMtdStartedAt: new Date().toISOString(),
    aiRunLockUntil: null,
    aiDrainInProgress: false,
    aiPendingLotCount: 0,
  };
}

function seedSettings(qc: QueryClient, helperUrl: string | null) {
  qc.setQueryData(['system-settings'], settings(helperUrl));
}

let fetchSpy: ReturnType<typeof vi.fn>;
const realFetch = globalThis.fetch;

beforeEach(() => {
  resetMockApi();
  fetchSpy = vi.fn();
  globalThis.fetch = fetchSpy as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

describe('useBulkLabelPrint', () => {
  it('runs prints serially in lotId order, all succeed', async () => {
    mockApi({
      'POST /labels/render': ({ body }) => ({ zpl: `ZPL ${(body as { lotId: string }).lotId}` }),
    });
    fetchSpy.mockResolvedValue({ ok: true } as Response);
    const queryClient = createTestQueryClient();
    seedSettings(queryClient, HELPER);

    const { result } = renderHookWithProviders(() => useBulkLabelPrint(), { queryClient });

    let printResult: { sentCount: number; failedCount: number } | undefined;
    await act(async () => {
      printResult = await result.current.mutateAsync(['lot-1', 'lot-2', 'lot-3']);
    });

    expect(printResult).toEqual({ sentCount: 3, failedCount: 0 });

    const renderCalls = getApiCalls().filter((c) => c.path === '/labels/render');
    expect(renderCalls.map((c) => (c.body as { lotId: string }).lotId)).toEqual(['lot-1', 'lot-2', 'lot-3']);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(fetchSpy.mock.calls[0][0]).toBe(`${HELPER}/write`);
  });

  it('continues past per-lot failures and tallies sent vs failed', async () => {
    mockApi({
      'POST /labels/render': () => ({ zpl: 'ZPL' }),
    });
    let call = 0;
    fetchSpy.mockImplementation(async () => {
      call += 1;
      if (call === 2) return { ok: false, status: 500 } as Response;
      return { ok: true } as Response;
    });
    const queryClient = createTestQueryClient();
    seedSettings(queryClient, HELPER);

    const { result } = renderHookWithProviders(() => useBulkLabelPrint(), { queryClient });

    let printResult: { sentCount: number; failedCount: number } | undefined;
    await act(async () => {
      printResult = await result.current.mutateAsync(['lot-1', 'lot-2', 'lot-3']);
    });

    expect(printResult).toEqual({ sentCount: 2, failedCount: 1 });
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it('rejects with NO_HELPER_URL and fires no work when helper not configured', async () => {
    const queryClient = createTestQueryClient();
    seedSettings(queryClient, null);

    const { result } = renderHookWithProviders(() => useBulkLabelPrint(), { queryClient });

    let err: Error | null = null;
    await act(async () => {
      try {
        await result.current.mutateAsync(['lot-1']);
      } catch (e) {
        err = e as Error;
      }
    });

    expect(err?.message).toBe('NO_HELPER_URL');
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(getApiCalls().filter((c) => c.path === '/labels/render')).toHaveLength(0);
  });

  it('invalidates ["lots-infinite"] exactly once on settle, not per-lot', async () => {
    mockApi({
      'POST /labels/render': () => ({ zpl: 'ZPL' }),
    });
    fetchSpy.mockResolvedValue({ ok: true } as Response);
    const queryClient = createTestQueryClient();
    seedSettings(queryClient, HELPER);
    queryClient.setQueryData(['lots-infinite', {}], { pages: [], pageParams: [] });

    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHookWithProviders(() => useBulkLabelPrint(), { queryClient });

    await act(async () => {
      await result.current.mutateAsync(['lot-1', 'lot-2', 'lot-3']);
    });

    const lotsInfiniteCalls = invalidateSpy.mock.calls.filter((c) => {
      const arg = c[0] as { queryKey?: unknown[] } | undefined;
      return Array.isArray(arg?.queryKey) && arg.queryKey[0] === 'lots-infinite';
    });
    expect(lotsInfiniteCalls).toHaveLength(1);
  });

  it('shows the static "Sending N labels to the printer" toast during the loop and dismisses it after', async () => {
    mockApi({
      'POST /labels/render': () => ({ zpl: 'ZPL' }),
    });
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    fetchSpy.mockImplementation(async () => {
      await gate;
      return { ok: true } as Response;
    });
    const queryClient = createTestQueryClient();
    seedSettings(queryClient, HELPER);

    const { result } = renderHookWithProviders(() => useBulkLabelPrint(), { queryClient, withToaster: true });

    let donePromise: Promise<unknown> = Promise.resolve();
    act(() => {
      donePromise = result.current.mutateAsync(['lot-1', 'lot-2']);
    });

    // Toast appears as soon as the loop body fires the static toast
    await screen.findByText('Sending 2 labels to the printer');

    // Release the gate, let the loop finish
    release();
    await act(async () => { await donePromise; });

    // Toast is dismissed at end-of-loop
    await waitFor(() => {
      expect(screen.queryByText('Sending 2 labels to the printer')).not.toBeInTheDocument();
    });
  });
});
