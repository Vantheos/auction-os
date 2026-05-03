// tests/client/components/PhotoManager.test.tsx
// C8 of the Phase 3.5 backfill.
//
// PhotoManager has two paths for "delete the last photo of a cataloging
// lot" (which cascades to delete the whole lot per the deferrable trigger
// in migration 0008):
//   - LotDetail path: no onLotDeleted callback → PhotoManager runs the
//     default DELETE /lots/:id + invalidate ['lots-infinite']
//   - Cataloging-session path: onLotDeleted provided → PhotoManager awaits
//     the callback (which itself owns the deletion + session reset) and
//     does NOT run the default
//
// The invariant: when onLotDeleted is provided, the default DELETE must
// NOT fire — otherwise the cataloging session would race the parent's own
// deletion, double-decrementing or 404'ing. Phase 3 caught this when the
// PhotoManager invocation diverged between routes.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PhotoManager } from '@/components/catalog/PhotoManager';
import {
  createTestQueryClient,
  renderWithProviders,
} from '../../helpers/render-with-providers';
import { mockApi, resetMockApi, getApiCalls } from '../../helpers/mock-api';
import { makePhoto } from '../../helpers/fixtures';

vi.mock('@/lib/api', async () => ({
  api: (await import('../../helpers/mock-api')).apiMockImpl,
}));

// Stub the capture-side hooks so PhotoManager mounts cleanly without
// pulling in idb / supabase.
vi.mock('@/hooks/useCatalogSession', () => ({
  useCapturePhoto: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('@/hooks/usePhotoCapture', () => ({
  usePhotoCapture: () => ({
    openCamera: vi.fn(),
    inputRef: { current: null },
    onChange: vi.fn(),
  }),
}));

beforeEach(() => resetMockApi());

// Helper: build a queryClient with the photos cache seeded BEFORE render.
// Seeding after render misses the initial useLotPhotos read, so PhotoManager
// shows its empty-state ("No photos yet") and bails before mounting the
// actions.
function clientWithPhotos(lotId: string) {
  const qc = createTestQueryClient();
  qc.setQueryData(
    ['lot-photos', lotId],
    [makePhoto({ id: 'p1', lotId, displayOrder: 1 })],
  );
  return qc;
}

describe('PhotoManager — onLotDeleted routing', () => {
  it('C8 — when onLotDeleted is provided, callback is invoked and default DELETE is NOT called', async () => {
    const onLotDeleted = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();

    // No DELETE /lots/lot-1 route registered — if the default path runs, the
    // mock will throw "no route registered" and the test will fail loudly.

    renderWithProviders(
      <PhotoManager lotId="lot-1" onClose={onClose} onLotDeleted={onLotDeleted} />,
      { queryClient: clientWithPhotos('lot-1') },
    );

    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Delete' }));

    expect(
      await screen.findByText(/A lot must always have at least one photo/),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'Delete photo & lot' }),
    );

    await waitFor(() => expect(onLotDeleted).toHaveBeenCalledTimes(1));
    expect(onClose).toHaveBeenCalledTimes(1);

    // Crucial: the default DELETE path did NOT fire
    expect(
      getApiCalls().find((c) => c.method === 'DELETE'),
    ).toBeUndefined();
  });

  it('C8 — when onLotDeleted is omitted, default DELETE /lots/:id fires', async () => {
    const onClose = vi.fn();

    mockApi({
      'DELETE /lots/lot-1': () => ({ ok: true }),
    });

    renderWithProviders(
      <PhotoManager lotId="lot-1" onClose={onClose} />,
      { queryClient: clientWithPhotos('lot-1') },
    );

    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Delete' }));

    expect(
      await screen.findByText(/A lot must always have at least one photo/),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'Delete photo & lot' }),
    );

    await waitFor(() =>
      expect(
        getApiCalls().find((c) => c.method === 'DELETE' && c.path === '/lots/lot-1'),
      ).toBeDefined(),
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
