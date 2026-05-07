// tests/client/components/PendingUploadsIndicator.test.tsx
// Phase 6 follow-up — covers the indicator's retry/discard popover so a
// terminal-failure upload entry is recoverable without dev-tools tricks.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../helpers/render-with-providers';
import { mockApi, resetMockApi, getApiCalls } from '../../helpers/mock-api';
import { PendingUploadsIndicator } from '@/components/catalog/PendingUploadsIndicator';
import type { UploadQueueEntry } from '@/lib/idb';

vi.mock('@/lib/api', async () => ({
  api: (await import('../../helpers/mock-api')).apiMockImpl,
}));

const retryFn = vi.hoisted(() => vi.fn(async (_id: string) => undefined));
const discardFn = vi.hoisted(() => vi.fn(async (_id: string) => undefined));
const queueState = vi.hoisted(() => ({ entries: [] as UploadQueueEntry[] }));

vi.mock('@/hooks/useUploadQueue', () => ({
  useUploadQueue: () => {
    const pending = queueState.entries;
    return {
      pending,
      pendingCount: pending.filter((e) => e.retries >= 0).length,
      perLotPending: () => [],
      failedCount: pending.filter((e) => e.retries < 0).length,
      retry: retryFn,
      discard: discardFn,
      enqueue: vi.fn(),
    };
  },
}));

function makeEntry(overrides: Partial<UploadQueueEntry> = {}): UploadQueueEntry {
  return {
    photoId: 'photo-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    lotId: 'lot-11111111-2222-3333-4444-555555555555',
    blob: new Blob(['x'.repeat(1024)], { type: 'image/jpeg' }),
    uploadUrl: 'https://signed/upload',
    storagePath: 'lots/x/p.jpg',
    retries: -1,
    createdAt: Date.now(),
    ...overrides,
  };
}

beforeEach(() => {
  resetMockApi();
  retryFn.mockClear();
  discardFn.mockClear();
  queueState.entries = [];
});

describe('PendingUploadsIndicator', () => {
  it('renders nothing when there is no activity', () => {
    queueState.entries = [];
    renderWithProviders(<PendingUploadsIndicator />);
    expect(screen.queryByText(/uploading/i)).toBeNull();
    expect(screen.queryByText(/failed/i)).toBeNull();
  });

  it('shows pending count for in-flight entries', () => {
    queueState.entries = [makeEntry({ retries: 0 })];
    renderWithProviders(<PendingUploadsIndicator />);
    expect(screen.getByText('1 uploading')).toBeInTheDocument();
  });

  it('failed pill is a clickable button that opens a popover with retry/discard per entry', async () => {
    const user = userEvent.setup();
    queueState.entries = [makeEntry({ photoId: 'p-1', retries: -1 })];
    renderWithProviders(<PendingUploadsIndicator />);
    const pill = screen.getByRole('button', { name: /1 failed/i });
    await user.click(pill);
    expect(screen.getByRole('dialog', { name: /Failed uploads/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Discard' })).toBeInTheDocument();
  });

  it('Retry calls the queue retry function with the entry id', async () => {
    const user = userEvent.setup();
    queueState.entries = [makeEntry({ photoId: 'p-1', retries: -1 })];
    renderWithProviders(<PendingUploadsIndicator />);
    await user.click(screen.getByRole('button', { name: /1 failed/i }));
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(retryFn).toHaveBeenCalledWith('p-1');
  });

  it('Discard calls discard then DELETEs the lot_photo row server-side', async () => {
    const user = userEvent.setup();
    mockApi({
      'DELETE /lots/lot-1/photos/p-1': () => ({ ok: true, remaining: [] }),
    });
    queueState.entries = [makeEntry({ photoId: 'p-1', lotId: 'lot-1', retries: -1 })];
    renderWithProviders(<PendingUploadsIndicator />, { withToaster: true });

    await user.click(screen.getByRole('button', { name: /1 failed/i }));
    await user.click(screen.getByRole('button', { name: 'Discard' }));

    await waitFor(() => expect(discardFn).toHaveBeenCalledWith('p-1'));
    await waitFor(() => {
      const deleteCalls = getApiCalls().filter(
        (c) => c.method === 'DELETE' && c.path === '/lots/lot-1/photos/p-1',
      );
      expect(deleteCalls).toHaveLength(1);
    });
  });

  it('Discard surfaces a warning toast when server cleanup fails', async () => {
    const user = userEvent.setup();
    mockApi({
      'DELETE /lots/lot-1/photos/p-1': () => {
        throw new Error('500 boom');
      },
    });
    queueState.entries = [makeEntry({ photoId: 'p-1', lotId: 'lot-1', retries: -1 })];
    renderWithProviders(<PendingUploadsIndicator />, { withToaster: true });

    await user.click(screen.getByRole('button', { name: /1 failed/i }));
    await user.click(screen.getByRole('button', { name: 'Discard' }));

    expect(await screen.findByText(/Photo discarded locally/i)).toBeInTheDocument();
  });

  it('popover auto-closes once the last failed entry is gone', async () => {
    const user = userEvent.setup();
    queueState.entries = [makeEntry({ photoId: 'p-1', retries: -1 })];
    const { rerender } = renderWithProviders(<PendingUploadsIndicator />);
    await user.click(screen.getByRole('button', { name: /1 failed/i }));
    expect(screen.getByRole('dialog', { name: /Failed uploads/i })).toBeInTheDocument();

    // Simulate the queue clearing the entry (e.g., after retry success).
    act(() => {
      queueState.entries = [];
    });
    rerender(<PendingUploadsIndicator />);

    expect(screen.queryByRole('dialog', { name: /Failed uploads/i })).toBeNull();
  });
});
