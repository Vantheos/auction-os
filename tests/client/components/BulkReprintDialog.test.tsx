// tests/client/components/BulkReprintDialog.test.tsx
//
// Phase 7 area E. Verifies the new bulk-reprint confirm dialog: count
// displays, confirm fires onConfirm, cancel calls onClose, busy disables.

import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { BulkReprintDialog } from '@/components/bulk/BulkReprintDialog';
import { renderWithProviders } from '../../helpers/render-with-providers';

describe('BulkReprintDialog', () => {
  it('shows the count and singularizes label copy correctly', () => {
    const { rerender } = renderWithProviders(
      <BulkReprintDialog open onClose={() => {}} count={5} onConfirm={async () => {}} />,
    );
    expect(screen.getByRole('button', { name: 'Reprint 5 labels' })).toBeInTheDocument();

    rerender(
      <BulkReprintDialog open onClose={() => {}} count={1} onConfirm={async () => {}} />,
    );
    expect(screen.getByRole('button', { name: 'Reprint 1 label' })).toBeInTheDocument();
  });

  it('confirm fires onConfirm', async () => {
    const onConfirm = vi.fn(async () => {});
    renderWithProviders(
      <BulkReprintDialog open onClose={() => {}} count={3} onConfirm={onConfirm} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Reprint 3 labels' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('cancel calls onClose without firing onConfirm', () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn(async () => {});
    renderWithProviders(
      <BulkReprintDialog open onClose={onClose} count={3} onConfirm={onConfirm} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('busy=true disables both buttons and shows "Sending…"', () => {
    renderWithProviders(
      <BulkReprintDialog open onClose={() => {}} count={3} onConfirm={async () => {}} busy />,
    );
    const confirm = screen.getByRole('button', { name: 'Sending…' });
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    expect(confirm).toBeDisabled();
    expect(cancel).toBeDisabled();
  });
});
