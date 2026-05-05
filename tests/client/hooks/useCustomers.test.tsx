// tests/client/hooks/useCustomers.test.tsx
// Phase 5 Area 2 — invalidation tests for the new customer mutation hooks.
// Per docs/testing-policy.md: every new mutation hook gets invalidation +
// error path tests.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, waitFor } from '@testing-library/react';
import {
  useCreateCustomer,
  useUpdateCustomer,
  useToggleCustomerDisabled,
} from '@/hooks/useCustomers';
import { renderHookWithProviders } from '../../helpers/render-with-providers';
import { mockApi, resetMockApi } from '../../helpers/mock-api';
import type { CustomerDTO } from '@shared/types';

vi.mock('@/lib/api', async () => ({
  api: (await import('../../helpers/mock-api')).apiMockImpl,
}));

beforeEach(() => resetMockApi());

function makeCustomer(overrides: Partial<CustomerDTO> = {}): CustomerDTO {
  return {
    id: 'cust-1',
    name: 'Acme Co',
    sellerCode: 'ACME001',
    disabledAt: null,
    createdAt: '2026-05-04T12:00:00.000Z',
    updatedAt: '2026-05-04T12:00:00.000Z',
    ...overrides,
  };
}

describe('useCreateCustomer', () => {
  it('invalidates ["customers"] on success', async () => {
    mockApi({
      'POST /customers': () => makeCustomer({ id: 'new', name: 'New', sellerCode: 'NEW001' }),
    });

    const { result, queryClient } = renderHookWithProviders(() => useCreateCustomer());
    queryClient.setQueryData(['customers'], [makeCustomer()]);

    act(() => {
      result.current.mutate({ name: 'New', sellerCode: 'NEW001' });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(queryClient.getQueryState(['customers'])?.isInvalidated).toBe(true);
  });

  it('still invalidates ["customers"] when the server rejects (error path)', async () => {
    mockApi({
      'POST /customers': () => {
        throw new Error('INVALID_BODY');
      },
    });

    const { result, queryClient } = renderHookWithProviders(() => useCreateCustomer());
    queryClient.setQueryData(['customers'], [makeCustomer()]);

    act(() => {
      result.current.mutate({ name: 'X', sellerCode: '' });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(queryClient.getQueryState(['customers'])?.isInvalidated).toBe(true);
  });
});

describe('useUpdateCustomer', () => {
  it('invalidates ["customers"] and ["customer", id] on success', async () => {
    mockApi({
      'PATCH /customers/abc': () => makeCustomer({ id: 'abc', name: 'Renamed' }),
    });

    const { result, queryClient } = renderHookWithProviders(() => useUpdateCustomer());
    queryClient.setQueryData(['customers'], [makeCustomer({ id: 'abc' })]);
    queryClient.setQueryData(['customer', 'abc'], makeCustomer({ id: 'abc' }));

    act(() => {
      result.current.mutate({ id: 'abc', name: 'Renamed' });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(queryClient.getQueryState(['customers'])?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(['customer', 'abc'])?.isInvalidated).toBe(true);
  });

  it('still invalidates on error (e.g. server validation rejection)', async () => {
    mockApi({
      'PATCH /customers/abc': () => {
        throw new Error('INVALID_BODY');
      },
    });

    const { result, queryClient } = renderHookWithProviders(() => useUpdateCustomer());
    queryClient.setQueryData(['customers'], [makeCustomer({ id: 'abc' })]);

    act(() => {
      result.current.mutate({ id: 'abc', sellerCode: '' });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(queryClient.getQueryState(['customers'])?.isInvalidated).toBe(true);
  });
});

describe('useToggleCustomerDisabled', () => {
  it('invalidates on disable success', async () => {
    mockApi({
      'PATCH /customers/abc': () => makeCustomer({ id: 'abc', disabledAt: '2026-05-04T13:00:00.000Z' }),
    });

    const { result, queryClient } = renderHookWithProviders(() => useToggleCustomerDisabled());
    queryClient.setQueryData(['customers'], [makeCustomer({ id: 'abc' })]);
    queryClient.setQueryData(['customer', 'abc'], makeCustomer({ id: 'abc' }));

    act(() => {
      result.current.mutate({ id: 'abc', disabled: true });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(queryClient.getQueryState(['customers'])?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(['customer', 'abc'])?.isInvalidated).toBe(true);
  });

  it('invalidates on re-enable success', async () => {
    mockApi({
      'PATCH /customers/abc': () => makeCustomer({ id: 'abc', disabledAt: null }),
    });

    const { result, queryClient } = renderHookWithProviders(() => useToggleCustomerDisabled());
    queryClient.setQueryData(['customers'], [makeCustomer({ id: 'abc', disabledAt: '2026-05-04T13:00:00.000Z' })]);

    act(() => {
      result.current.mutate({ id: 'abc', disabled: false });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(queryClient.getQueryState(['customers'])?.isInvalidated).toBe(true);
  });

  it('still invalidates on error path', async () => {
    mockApi({
      'PATCH /customers/abc': () => {
        throw new Error('INTERNAL');
      },
    });

    const { result, queryClient } = renderHookWithProviders(() => useToggleCustomerDisabled());
    queryClient.setQueryData(['customers'], [makeCustomer({ id: 'abc' })]);

    act(() => {
      result.current.mutate({ id: 'abc', disabled: true });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(queryClient.getQueryState(['customers'])?.isInvalidated).toBe(true);
  });
});
