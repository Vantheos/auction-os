// tests/client/hooks/useUsers.test.tsx
// Phase 4 Area 2 — invalidation tests for the user mutation hooks.
// Per docs/testing-policy.md: every new mutation hook gets at least an
// invalidation + error path test.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, waitFor } from '@testing-library/react';
import { useCreateUser, useUpdateUser, useUsers } from '@/hooks/useUsers';
import { renderHookWithProviders } from '../../helpers/render-with-providers';
import { mockApi, resetMockApi } from '../../helpers/mock-api';
import type { UserDTO } from '@shared/types';

vi.mock('@/lib/api', async () => ({
  api: (await import('../../helpers/mock-api')).apiMockImpl,
}));

beforeEach(() => resetMockApi());

function makeUser(overrides: Partial<UserDTO> = {}): UserDTO {
  return {
    id: 'user-1',
    role: 'office',
    displayName: 'Office User',
    email: 'office@example.com',
    disabledAt: null,
    createdAt: '2026-05-01T12:00:00.000Z',
    updatedAt: '2026-05-01T12:00:00.000Z',
    ...overrides,
  };
}

describe('useCreateUser', () => {
  it('invalidates ["users"] on settle', async () => {
    mockApi({
      'POST /users': () => makeUser({ id: 'new', email: 'new@example.com' }),
    });

    const { result, queryClient } = renderHookWithProviders(() => useCreateUser());
    queryClient.setQueryData(['users'], [makeUser()]);

    act(() => {
      result.current.mutate({
        email: 'new@example.com',
        password: 'hunter22hunter22',
        role: 'warehouse',
        displayName: 'New',
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(queryClient.getQueryState(['users'])?.isInvalidated).toBe(true);
  });
});

describe('useUpdateUser', () => {
  it('invalidates ["users"] on role change', async () => {
    mockApi({
      'PATCH /users/abc': () => makeUser({ id: 'abc', role: 'warehouse' }),
    });

    const { result, queryClient } = renderHookWithProviders(() => useUpdateUser());
    queryClient.setQueryData(['users'], [makeUser({ id: 'abc' })]);

    act(() => {
      result.current.mutate({ id: 'abc', input: { role: 'warehouse' } });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(queryClient.getQueryState(['users'])?.isInvalidated).toBe(true);
  });

  it('invalidates ["users"] on disable toggle', async () => {
    mockApi({
      'PATCH /users/abc': () => makeUser({ id: 'abc', disabledAt: '2026-05-03T00:00:00.000Z' }),
    });

    const { result, queryClient } = renderHookWithProviders(() => useUpdateUser());
    queryClient.setQueryData(['users'], [makeUser({ id: 'abc' })]);

    act(() => {
      result.current.mutate({ id: 'abc', input: { disabled: true } });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(queryClient.getQueryState(['users'])?.isInvalidated).toBe(true);
  });

  it('still invalidates ["users"] when the server rejects (error path)', async () => {
    mockApi({
      'PATCH /users/abc': () => {
        throw new Error('CANNOT_REMOVE_LAST_ADMIN');
      },
    });

    const { result, queryClient } = renderHookWithProviders(() => useUpdateUser());
    queryClient.setQueryData(['users'], [makeUser({ id: 'abc', role: 'admin' })]);

    act(() => {
      result.current.mutate({ id: 'abc', input: { role: 'office' } });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    // onSettled fires for both success and error; the user list refetches
    // either way so the UI reflects the actual server state.
    expect(queryClient.getQueryState(['users'])?.isInvalidated).toBe(true);
  });
});

describe('useUsers', () => {
  it('queries ["users"] and returns the list', async () => {
    const list = [makeUser({ id: 'a' }), makeUser({ id: 'b', role: 'warehouse' })];
    mockApi({ 'GET /users': () => ({ users: list }) });

    const { result } = renderHookWithProviders(() => useUsers());
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(list);
  });
});
