// tests/client/components/LotDetail.test.tsx
// C4 of the Phase 3.5 backfill.
//
// Toast wiring on single-lot mutations. The Phase 3 regression batch
// (T-A6/A8/A10) had several mutations failing silently with no user
// feedback. The fix wired success/danger toasts in handleSave / handleDelete
// / handlePickState / move dialog onConfirm. These tests verify that wiring
// for save and delete (the two most-used flows). State change and move
// share the same wiring shape; if the structural pattern works for save
// and delete, regression risk on the others is low — and driving the
// nested ChangeStateMenu / MoveLotDialog flows is significant test surface
// for diminishing return. Add them when those flows are touched.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LotDetail } from '@/components/lot/LotDetail';
import { renderWithProviders } from '../../helpers/render-with-providers';
import { mockApi, resetMockApi } from '../../helpers/mock-api';
import { makeLot } from '../../helpers/fixtures';

vi.mock('@/lib/api', async () => ({
  api: (await import('../../helpers/mock-api')).apiMockImpl,
}));

// Stub useRole as admin so all the role-gated buttons render
vi.mock('@/lib/auth', () => ({
  useRole: () => 'admin',
}));

// Stub the label-print and photo-capture hook surfaces. They each pull in
// transitive dependencies (system settings, idb, supabase storage) that
// don't matter for toast-wiring assertions.
vi.mock('@/hooks/useLabelPrint', () => ({
  useLabelPrint: () => ({ mutate: vi.fn(), isPending: false }),
}));

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

describe('LotDetail — toast wiring', () => {
  describe('save (PATCH /lots/:id)', () => {
    it('shows success toast on successful save', async () => {
      const lot = makeLot({ id: 'lot-1', state: 'unassigned' });
      mockApi({
        'GET /lots/lot-1/photos': () => ({ photos: [] }),
        'PATCH /lots/lot-1': () => makeLot({ id: 'lot-1', state: 'unassigned' }),
      });

      const user = userEvent.setup();
      renderWithProviders(<LotDetail lot={lot} canEdit canDelete />, {
        withToaster: true,
      });

      await user.click(screen.getByRole('button', { name: 'Save changes' }));

      expect(await screen.findByText('Lot updated')).toBeInTheDocument();
    });

    it('shows danger toast with server message on save failure', async () => {
      const lot = makeLot({ id: 'lot-1', state: 'unassigned' });
      mockApi({
        'GET /lots/lot-1/photos': () => ({ photos: [] }),
        'PATCH /lots/lot-1': () => {
          throw new Error('server validation: ref1 too long');
        },
      });

      const user = userEvent.setup();
      renderWithProviders(<LotDetail lot={lot} canEdit canDelete />, {
        withToaster: true,
      });

      // handleSave intentionally re-throws so the form stays dirty; RHF then
      // re-throws from handleSubmit and the click promise rejects. Absorb it.
      await user
        .click(screen.getByRole('button', { name: 'Save changes' }))
        .catch(() => {});

      expect(await screen.findByText('Could not update lot')).toBeInTheDocument();
      expect(
        await screen.findByText('server validation: ref1 too long'),
      ).toBeInTheDocument();
    });
  });

  describe('delete (DELETE /lots/:id)', () => {
    it('shows success toast on successful delete', async () => {
      const lot = makeLot({ id: 'lot-1', state: 'unassigned' });
      mockApi({
        'GET /lots/lot-1/photos': () => ({ photos: [] }),
        'DELETE /lots/lot-1': () => ({ ok: true as const }),
      });

      const user = userEvent.setup();
      renderWithProviders(<LotDetail lot={lot} canEdit canDelete />, {
        withToaster: true,
      });

      // Open the delete confirm dialog
      await user.click(screen.getByRole('button', { name: 'Delete' }));
      // Type DELETE to enable the destructive button
      const confirmInput = await screen.findByRole('textbox');
      await user.type(confirmInput, 'DELETE');
      // The dialog has its own "Delete" button — getAllByRole and pick the one inside
      const deleteButtons = screen.getAllByRole('button', { name: 'Delete' });
      // First one is the trigger (still in DOM); the new one is in the dialog
      await user.click(deleteButtons[deleteButtons.length - 1]);

      expect(await screen.findByText('Lot deleted')).toBeInTheDocument();
    });

    it('shows danger toast with server message on delete failure', async () => {
      const lot = makeLot({ id: 'lot-1', state: 'unassigned' });
      mockApi({
        'GET /lots/lot-1/photos': () => ({ photos: [] }),
        'DELETE /lots/lot-1': () => {
          throw new Error('cannot delete sold lot');
        },
      });

      const user = userEvent.setup();
      renderWithProviders(<LotDetail lot={lot} canEdit canDelete />, {
        withToaster: true,
      });

      await user.click(screen.getByRole('button', { name: 'Delete' }));
      const confirmInput = await screen.findByRole('textbox');
      await user.type(confirmInput, 'DELETE');
      const deleteButtons = screen.getAllByRole('button', { name: 'Delete' });
      await user.click(deleteButtons[deleteButtons.length - 1]);

      expect(await screen.findByText('Could not delete lot')).toBeInTheDocument();
      expect(await screen.findByText('cannot delete sold lot')).toBeInTheDocument();
    });
  });
});
