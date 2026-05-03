// tests/client/patterns/03-error-toast.test.tsx
//
// PATTERN: A failing mutation produces a `danger` toast whose description
// shows the server's error message. Verifies the wiring between the mutation
// hook's onError and the ToastProvider — exactly the gap that left several
// Phase 3 mutations silently failing with no user feedback (T-A6 batch).
//
// Render with `withToaster: true` so the rendered toast actually appears in
// the DOM where queries can find it.
//
// HOW TO ADAPT for a real hook:
//   - Replace `useDoSomething` with the real mutation hook (which should
//     surface toasts via the same ToastProvider).
//   - Replace the title / description assertions with whatever the real
//     hook is supposed to render.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useMutation } from '@tanstack/react-query';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { api } from '@/lib/api';
import { useToast } from '@/components/ui/toast';
import { renderWithProviders } from '../../helpers/render-with-providers';
import { mockApi, resetMockApi } from '../../helpers/mock-api';

vi.mock('@/lib/api', async () => ({
  api: (await import('../../helpers/mock-api')).apiMockImpl,
}));

beforeEach(() => resetMockApi());

// --- Synthetic toy hook + component -----------------------------------------

function useDoSomething() {
  const { toast } = useToast();
  return useMutation({
    mutationFn: () => api<void>('/do-something', { method: 'POST' }),
    onError: (err: Error) => {
      toast({
        title: 'Failed',
        description: err.message,
        variant: 'danger',
      });
    },
  });
}

function ToyButton() {
  const m = useDoSomething();
  return (
    <button type="button" onClick={() => m.mutate()}>
      Do it
    </button>
  );
}

// --- Tests ------------------------------------------------------------------

describe('PATTERN — error toast on mutation failure', () => {
  it('shows a danger toast with title + server message when the mutation throws', async () => {
    mockApi({
      'POST /do-something': () => {
        throw new Error('server says no');
      },
    });

    const user = userEvent.setup();
    renderWithProviders(<ToyButton />, { withToaster: true });

    await user.click(screen.getByRole('button', { name: 'Do it' }));

    expect(await screen.findByText('Failed')).toBeInTheDocument();
    expect(await screen.findByText('server says no')).toBeInTheDocument();
  });
});
