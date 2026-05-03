// tests/client/components/LotDetail.test.tsx
// C4 of the Phase 3.5 backfill — toast wiring on all four single-lot
// mutations (save, state-change, move, delete). The Phase 3 regression
// batch (T-A6/A8/A10) had several mutations failing silently with no
// user feedback. Each path now toasts on success and danger-toasts with
// the server message on failure.
//
// State-change is tested via a non-terminal transition (assigned →
// unassigned), which doesn't open the confirm dialog. The terminal path
// (e.g. assigned → sold) opens a Dialog first and then calls the same
// changeState.mutate({ onSuccess, onError }) wiring — duplicated, but
// structurally identical. Add a terminal-path test if either copy of
// that wiring drifts.

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

  describe('state-change (PATCH /lots/:id with state)', () => {
    it('shows success toast on successful non-terminal transition', async () => {
      const lot = makeLot({ id: 'lot-1', state: 'assigned', jobId: 'job-1', lotNumber: 1 });
      mockApi({
        'GET /lots/lot-1/photos': () => ({ photos: [] }),
        'PATCH /lots/lot-1': () => makeLot({ id: 'lot-1', state: 'unassigned' }),
      });

      const user = userEvent.setup();
      renderWithProviders(<LotDetail lot={lot} canEdit canDelete />, {
        withToaster: true,
      });

      await user.click(screen.getByRole('button', { name: 'Change status' }));
      // Pick the non-terminal transition (assigned → unassigned). Radix
      // DropdownMenuItem is exposed as role="menuitem".
      const menuitems = await screen.findAllByRole('menuitem');
      const unassignedItem = menuitems.find((el) =>
        el.textContent?.toLowerCase().includes('unassigned'),
      );
      if (!unassignedItem) throw new Error('unassigned menuitem not found');
      await user.click(unassignedItem);

      expect(
        await screen.findByText('State changed to unassigned'),
      ).toBeInTheDocument();
    });

    it('shows danger toast with server message on state-change failure', async () => {
      const lot = makeLot({ id: 'lot-1', state: 'assigned', jobId: 'job-1', lotNumber: 1 });
      mockApi({
        'GET /lots/lot-1/photos': () => ({ photos: [] }),
        'PATCH /lots/lot-1': () => {
          throw new Error('illegal transition');
        },
      });

      const user = userEvent.setup();
      renderWithProviders(<LotDetail lot={lot} canEdit canDelete />, {
        withToaster: true,
      });

      await user.click(screen.getByRole('button', { name: 'Change status' }));
      const menuitems = await screen.findAllByRole('menuitem');
      const unassignedItem = menuitems.find((el) =>
        el.textContent?.toLowerCase().includes('unassigned'),
      );
      if (!unassignedItem) throw new Error('unassigned menuitem not found');
      await user.click(unassignedItem);

      expect(
        await screen.findByText('Could not change state'),
      ).toBeInTheDocument();
      expect(await screen.findByText('illegal transition')).toBeInTheDocument();
    });
  });

  describe('move (POST /lots/:id/move)', () => {
    it('shows success toast on successful move', async () => {
      const lot = makeLot({ id: 'lot-1', state: 'assigned', jobId: 'job-1', lotNumber: 1 });
      mockApi({
        'GET /lots/lot-1/photos': () => ({ photos: [] }),
        'GET /customers': () => ({
          customers: [
            {
              id: 'cust-2',
              name: 'Other Co',
              createdAt: '2026-05-01T12:00:00.000Z',
              updatedAt: '2026-05-01T12:00:00.000Z',
            },
          ],
        }),
        'GET /jobs': () => ({
          jobs: [
            {
              id: 'job-9',
              customerId: 'cust-2',
              jobNumber: '2026-05-Other-001',
              closedAt: null,
              createdAt: '2026-05-01T12:00:00.000Z',
              updatedAt: '2026-05-01T12:00:00.000Z',
            },
          ],
        }),
        'POST /lots/lot-1/move': () => makeLot({ id: 'lot-1', jobId: 'job-9', lotNumber: 10 }),
      });

      const user = userEvent.setup();
      renderWithProviders(<LotDetail lot={lot} canEdit canDelete />, {
        withToaster: true,
      });

      await user.click(screen.getByRole('button', { name: 'Assign to Job' }));

      // Customer dropdown — wait for query to resolve and option to appear
      const custSelect = await screen.findByLabelText('Destination customer');
      await user.selectOptions(custSelect, 'cust-2');

      // Job dropdown appears after customer is picked
      const jobSelect = await screen.findByLabelText('Destination job');
      await user.selectOptions(jobSelect, 'job-9');

      await user.click(screen.getByRole('button', { name: 'Assign lot' }));

      expect(await screen.findByText('Lot assigned')).toBeInTheDocument();
    });

    it('shows danger toast with server message on move failure', async () => {
      const lot = makeLot({ id: 'lot-1', state: 'assigned', jobId: 'job-1', lotNumber: 1 });
      mockApi({
        'GET /lots/lot-1/photos': () => ({ photos: [] }),
        'GET /customers': () => ({
          customers: [
            {
              id: 'cust-2',
              name: 'Other Co',
              createdAt: '2026-05-01T12:00:00.000Z',
              updatedAt: '2026-05-01T12:00:00.000Z',
            },
          ],
        }),
        'GET /jobs': () => ({
          jobs: [
            {
              id: 'job-9',
              customerId: 'cust-2',
              jobNumber: '2026-05-Other-001',
              closedAt: null,
              createdAt: '2026-05-01T12:00:00.000Z',
              updatedAt: '2026-05-01T12:00:00.000Z',
            },
          ],
        }),
        'POST /lots/lot-1/move': () => {
          throw new Error('destination job is closed');
        },
      });

      const user = userEvent.setup();
      renderWithProviders(<LotDetail lot={lot} canEdit canDelete />, {
        withToaster: true,
      });

      await user.click(screen.getByRole('button', { name: 'Assign to Job' }));
      const custSelect = await screen.findByLabelText('Destination customer');
      await user.selectOptions(custSelect, 'cust-2');
      const jobSelect = await screen.findByLabelText('Destination job');
      await user.selectOptions(jobSelect, 'job-9');
      await user.click(screen.getByRole('button', { name: 'Assign lot' }));

      expect(await screen.findByText('Could not assign lot')).toBeInTheDocument();
      expect(
        await screen.findByText('destination job is closed'),
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
