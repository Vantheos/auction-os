// tests/client/hooks/useJobs.test.tsx
// Phase 5 Area 3 — invalidation tests for the new useUpdateJob hook plus
// regression coverage for useCreateJob with the new fields.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, waitFor } from '@testing-library/react';
import { useCreateJob, useUpdateJob, useToggleJobClosed } from '@/hooks/useJobs';
import { renderHookWithProviders } from '../../helpers/render-with-providers';
import { mockApi, resetMockApi } from '../../helpers/mock-api';
import type { JobDTO } from '@shared/types';

vi.mock('@/lib/api', async () => ({
  api: (await import('../../helpers/mock-api')).apiMockImpl,
}));

beforeEach(() => resetMockApi());

function makeJob(overrides: Partial<JobDTO> = {}): JobDTO {
  return {
    id: 'job-1',
    customerId: 'cust-1',
    jobNumber: '2026-04-Smith-001',
    closedAt: null,
    startBid: '5.00',
    shippable: false,
    createdAt: '2026-05-04T12:00:00.000Z',
    updatedAt: '2026-05-04T12:00:00.000Z',
    ...overrides,
  };
}

describe('useCreateJob — accepts new export-default fields', () => {
  it('sends startBid + shippable when provided', async () => {
    let receivedBody: unknown;
    mockApi({
      'POST /jobs': (ctx: { body: unknown }) => {
        receivedBody = ctx.body;
        return makeJob({ startBid: '10.00', shippable: true });
      },
    });

    const { result } = renderHookWithProviders(() => useCreateJob('cust-1'));

    act(() => {
      result.current.mutate({ jobNumber: 'X', startBid: '10.00', shippable: true });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(receivedBody).toMatchObject({
      customerId: 'cust-1',
      jobNumber: 'X',
      startBid: '10.00',
      shippable: true,
    });
  });

  it('invalidates ["jobs", customerId] on success', async () => {
    mockApi({ 'POST /jobs': () => makeJob() });

    const { result, queryClient } = renderHookWithProviders(() => useCreateJob('cust-1'));
    queryClient.setQueryData(['jobs', 'cust-1'], [makeJob()]);

    act(() => {
      result.current.mutate({ jobNumber: 'X' });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(queryClient.getQueryState(['jobs', 'cust-1'])?.isInvalidated).toBe(true);
  });
});

describe('useUpdateJob', () => {
  it('invalidates ["jobs", customerId] and ["job", id] on startBid update', async () => {
    mockApi({
      'PATCH /jobs/abc': () => makeJob({ id: 'abc', startBid: '15.00' }),
    });

    const { result, queryClient } = renderHookWithProviders(() => useUpdateJob('cust-1'));
    queryClient.setQueryData(['jobs', 'cust-1'], [makeJob({ id: 'abc' })]);
    queryClient.setQueryData(['job', 'abc'], makeJob({ id: 'abc' }));

    act(() => {
      result.current.mutate({ id: 'abc', startBid: '15.00' });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(queryClient.getQueryState(['jobs', 'cust-1'])?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(['job', 'abc'])?.isInvalidated).toBe(true);
  });

  it('invalidates on shippable toggle', async () => {
    mockApi({ 'PATCH /jobs/abc': () => makeJob({ id: 'abc', shippable: true }) });

    const { result, queryClient } = renderHookWithProviders(() => useUpdateJob('cust-1'));
    queryClient.setQueryData(['jobs', 'cust-1'], [makeJob({ id: 'abc' })]);

    act(() => {
      result.current.mutate({ id: 'abc', shippable: true });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(queryClient.getQueryState(['jobs', 'cust-1'])?.isInvalidated).toBe(true);
  });

  it('still invalidates on error path', async () => {
    mockApi({
      'PATCH /jobs/abc': () => {
        throw new Error('INVALID_BODY');
      },
    });

    const { result, queryClient } = renderHookWithProviders(() => useUpdateJob('cust-1'));
    queryClient.setQueryData(['jobs', 'cust-1'], [makeJob({ id: 'abc' })]);

    act(() => {
      result.current.mutate({ id: 'abc', startBid: 'not-a-number' });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(queryClient.getQueryState(['jobs', 'cust-1'])?.isInvalidated).toBe(true);
  });
});

describe('useToggleJobClosed — regression after new fields', () => {
  it('still invalidates ["jobs", customerId]', async () => {
    mockApi({
      'PATCH /jobs/abc': () => makeJob({ id: 'abc', closedAt: '2026-05-04T13:00:00.000Z' }),
    });

    const { result, queryClient } = renderHookWithProviders(() => useToggleJobClosed('cust-1'));
    queryClient.setQueryData(['jobs', 'cust-1'], [makeJob({ id: 'abc' })]);

    act(() => {
      result.current.mutate({ id: 'abc', closed: true });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(queryClient.getQueryState(['jobs', 'cust-1'])?.isInvalidated).toBe(true);
  });
});
