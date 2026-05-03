// tests/client/components/LotEditForm.test.tsx
// C6 + C7 of the Phase 3.5 backfill.
//
// C6 — empty-string → null normalization. The "Invalid" toast bug from
// Phase 3 sign-off: HTML inputs surface blank fields as '', the server
// rejects price='' against its regex, the user sees a useless "Invalid"
// toast. handleValid normalizes '' to null for nullable string fields
// before calling onSubmit.
//
// C7 — RHF reset(values) post-save. After a successful submit, the form's
// dirty baseline must reset so the unsaved-changes warning stops firing
// when the modal closes. After a FAILED submit, the form must STAY dirty
// so the warning still fires (the work isn't saved). The mechanism:
// onSubmit rethrows on failure, handleValid awaits onSubmit and reaches
// reset(values) only on success.

import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LotEditForm } from '@/components/lot/LotEditForm';
import { renderWithProviders } from '../../helpers/render-with-providers';
import { makeLot } from '../../helpers/fixtures';

describe('LotEditForm', () => {
  describe('C6 — handleValid normalizes empty strings to null', () => {
    it('passes null (not "") for blank nullable string fields', async () => {
      const onSubmit = vi.fn().mockResolvedValue(undefined);
      const lot = makeLot({
        title: null,
        description: null,
        price: null,
        ref1: null,
        ref2: null,
        specialNotesText: null,
      });

      const user = userEvent.setup();
      renderWithProviders(<LotEditForm lot={lot} onSubmit={onSubmit} />);

      // Defaults are all empty strings (lot.title ?? ''). Save without changes.
      await user.click(screen.getByRole('button', { name: 'Save changes' }));

      await waitFor(() => expect(onSubmit).toHaveBeenCalled());
      const submitted = onSubmit.mock.calls[0][0];
      expect(submitted.title).toBeNull();
      expect(submitted.description).toBeNull();
      expect(submitted.price).toBeNull();
      expect(submitted.ref1).toBeNull();
      expect(submitted.ref2).toBeNull();
      expect(submitted.specialNotesText).toBeNull();
    });

    it('preserves real values, only converts truly-empty strings', async () => {
      const onSubmit = vi.fn().mockResolvedValue(undefined);
      const lot = makeLot({ title: 'Existing', price: '45.00', ref1: 'r1' });

      const user = userEvent.setup();
      renderWithProviders(<LotEditForm lot={lot} onSubmit={onSubmit} />);

      await user.click(screen.getByRole('button', { name: 'Save changes' }));

      await waitFor(() => expect(onSubmit).toHaveBeenCalled());
      const submitted = onSubmit.mock.calls[0][0];
      expect(submitted.title).toBe('Existing');
      expect(submitted.price).toBe('45.00');
      expect(submitted.ref1).toBe('r1');
      expect(submitted.ref2).toBeNull();
      expect(submitted.description).toBeNull();
    });
  });

  describe('C7 — reset post-save behavior', () => {
    it('after successful save, isDirty returns to false (onDirtyChange fires false)', async () => {
      const onDirtyChange = vi.fn();
      const onSubmit = vi.fn().mockResolvedValue(undefined);
      const lot = makeLot({ quantity: 5 });

      const user = userEvent.setup();
      renderWithProviders(
        <LotEditForm
          lot={lot}
          onSubmit={onSubmit}
          onDirtyChange={onDirtyChange}
        />,
      );

      // Edit quantity to dirty the form
      const qty = screen.getByLabelText('Quantity');
      await user.clear(qty);
      await user.type(qty, '7');

      await waitFor(() =>
        expect(onDirtyChange).toHaveBeenLastCalledWith(true),
      );

      await user.click(screen.getByRole('button', { name: 'Save changes' }));
      await waitFor(() => expect(onSubmit).toHaveBeenCalled());

      // reset(values) ran → isDirty went back to false → effect fired
      await waitFor(() =>
        expect(onDirtyChange).toHaveBeenLastCalledWith(false),
      );
    });

    it('after FAILED save, form stays dirty (onDirtyChange does NOT fire false)', async () => {
      const onDirtyChange = vi.fn();
      // The rejection is intentional — production code (LotDetail.handleSave)
      // re-throws so the form stays dirty and the unsaved-changes guard keeps
      // firing. RHF re-throws from handleSubmit, so user.click awaits a
      // rejected promise; absorb it here.
      const onSubmit = vi.fn(async () => {
        throw new Error('boom');
      });
      const lot = makeLot({ quantity: 5 });

      const user = userEvent.setup();
      renderWithProviders(
        <LotEditForm
          lot={lot}
          onSubmit={onSubmit}
          onDirtyChange={onDirtyChange}
        />,
      );

      const qty = screen.getByLabelText('Quantity');
      await user.clear(qty);
      await user.type(qty, '7');

      await waitFor(() =>
        expect(onDirtyChange).toHaveBeenLastCalledWith(true),
      );

      await user
        .click(screen.getByRole('button', { name: 'Save changes' }))
        .catch(() => {});
      await waitFor(() => expect(onSubmit).toHaveBeenCalled());

      // Give the rejection a tick to propagate through RHF's submit handler
      await new Promise((r) => setTimeout(r, 50));

      // The form stayed dirty: onDirtyChange's last call is still true. The
      // unsaved-changes warning will keep firing on close.
      const lastCall = onDirtyChange.mock.calls[onDirtyChange.mock.calls.length - 1];
      expect(lastCall[0]).toBe(true);
    });
  });
});
