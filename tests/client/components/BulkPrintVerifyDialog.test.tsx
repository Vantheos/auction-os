// tests/client/components/BulkPrintVerifyDialog.test.tsx
//
// Phase 7 area F. Verifies the verify-popup copy variants and that OK
// closes via the onClose callback.

import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { BulkPrintVerifyDialog } from '@/components/labels/BulkPrintVerifyDialog';
import { renderWithProviders } from '../../helpers/render-with-providers';

describe('BulkPrintVerifyDialog', () => {
  it('renders the success copy when failedCount === 0', () => {
    renderWithProviders(
      <BulkPrintVerifyDialog open onClose={() => {}} sentCount={3} failedCount={0} />,
    );
    expect(screen.getByText('Label print sent')).toBeInTheDocument();
    expect(screen.getByText(/label print jobs to the printer/)).toBeInTheDocument();
    expect(screen.getByText(/Reprint pending/i)).toBeInTheDocument();
    // Should NOT mention any failure language
    expect(screen.queryByText(/could not reach the printer/)).not.toBeInTheDocument();
  });

  it('renders the partial-failure copy when failedCount > 0', () => {
    renderWithProviders(
      <BulkPrintVerifyDialog open onClose={() => {}} sentCount={28} failedCount={2} />,
    );
    expect(screen.getByText(/could not reach the printer/)).toBeInTheDocument();
    expect(screen.getByText(/helper offline/)).toBeInTheDocument();
    // Mentions both numbers (28 sent of 30 total)
    const text = screen.getByText(/of/).textContent ?? '';
    expect(text).toMatch(/28/);
    expect(text).toMatch(/30/);
  });

  it('singularizes "job" / "label" copy when sent === 1', () => {
    renderWithProviders(
      <BulkPrintVerifyDialog open onClose={() => {}} sentCount={1} failedCount={0} />,
    );
    expect(screen.getByText(/label print job /)).toBeInTheDocument();
  });

  it('OK button calls onClose', () => {
    const onClose = vi.fn();
    renderWithProviders(
      <BulkPrintVerifyDialog open onClose={onClose} sentCount={3} failedCount={0} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
