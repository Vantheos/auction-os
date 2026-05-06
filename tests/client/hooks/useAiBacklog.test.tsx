// tests/client/hooks/useAiBacklog.test.tsx
// Toast text rendering is verified by component-level tests using
// `withToaster: true` + `screen.findByText`. Hook-level tests verify
// invalidation + error propagation per docs/testing-policy.md.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, waitFor, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderHookWithProviders, renderWithProviders } from '../../helpers/render-with-providers';
import { mockApi, resetMockApi } from '../../helpers/mock-api';
import { useAiBacklog } from '@/hooks/useAiBacklog';

vi.mock('@/lib/api', async () => ({
  api: (await import('../../helpers/mock-api')).apiMockImpl,
}));

beforeEach(() => resetMockApi());

describe('useAiBacklog (hook contract)', () => {
  it('invalidates ["lots-infinite"] and ["system-settings"] on success', async () => {
    mockApi({
      'POST /ai/backlog': () => ({ processed: 5, remaining: 0, errors: 0 }),
    });
    const { result, queryClient } = renderHookWithProviders(() => useAiBacklog());
    queryClient.setQueryData(['lots-infinite'], { pages: [] });
    queryClient.setQueryData(['system-settings'], { id: 1 });

    act(() => { result.current.mutate(); });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(queryClient.getQueryState(['lots-infinite'])?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(['system-settings'])?.isInvalidated).toBe(true);
  });

  it('exposes the server error on HTTP failure', async () => {
    mockApi({
      'POST /ai/backlog': () => { throw new Error('boom'); },
    });
    const { result } = renderHookWithProviders(() => useAiBacklog());

    act(() => { result.current.mutate(); });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('boom');
  });
});

// Toast surface tests — render a tiny component that uses the hook,
// with the Toaster present so we can assert the rendered text.
function ToyTrigger() {
  const m = useAiBacklog();
  return <button type="button" onClick={() => m.mutate()}>Run Now</button>;
}

describe('useAiBacklog (toast surface)', () => {
  it('shows "Backlog cleared" success toast when processed > 0 and remaining = 0', async () => {
    mockApi({
      'POST /ai/backlog': () => ({ processed: 5, remaining: 0, errors: 0 }),
    });
    renderWithProviders(<ToyTrigger />, { withToaster: true });
    await userEvent.setup().click(screen.getByRole('button', { name: 'Run Now' }));
    expect(await screen.findByText(/Backlog cleared/i)).toBeInTheDocument();
  });

  it('shows remaining count when not fully drained', async () => {
    mockApi({
      'POST /ai/backlog': () => ({ processed: 20, remaining: 13, errors: 0 }),
    });
    renderWithProviders(<ToyTrigger />, { withToaster: true });
    await userEvent.setup().click(screen.getByRole('button', { name: 'Run Now' }));
    expect(await screen.findByText(/13 remaining/i)).toBeInTheDocument();
  });

  it('shows "No lots are pending" when nothing to do', async () => {
    mockApi({
      'POST /ai/backlog': () => ({ processed: 0, remaining: 0, errors: 0 }),
    });
    renderWithProviders(<ToyTrigger />, { withToaster: true });
    await userEvent.setup().click(screen.getByRole('button', { name: 'Run Now' }));
    expect(await screen.findByText(/No lots are pending/i)).toBeInTheDocument();
  });

  it('shows "already in progress" on skipped: in_progress', async () => {
    mockApi({
      'POST /ai/backlog': () => ({ skipped: true, reason: 'in_progress' }),
    });
    renderWithProviders(<ToyTrigger />, { withToaster: true });
    await userEvent.setup().click(screen.getByRole('button', { name: 'Run Now' }));
    expect(await screen.findByText(/already in progress/i)).toBeInTheDocument();
  });

  it('shows danger toast with server error message on HTTP failure', async () => {
    mockApi({
      'POST /ai/backlog': () => { throw new Error('server says no'); },
    });
    renderWithProviders(<ToyTrigger />, { withToaster: true });
    await userEvent.setup().click(screen.getByRole('button', { name: 'Run Now' }));
    expect(await screen.findByText(/Could not start AI run/i)).toBeInTheDocument();
    expect(await screen.findByText(/server says no/i)).toBeInTheDocument();
  });
});
