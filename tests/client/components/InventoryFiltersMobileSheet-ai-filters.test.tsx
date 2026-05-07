// tests/client/components/InventoryFiltersMobileSheet-ai-filters.test.tsx
// Mobile drawer parallel to InventoryFilters-ai-filters.test.tsx — verifies
// the Awaiting AI + Needs review chips toggle in the mobile sheet and that
// Apply propagates the draft state up. Keeps the two surfaces in sync.

import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../helpers/render-with-providers';
import { InventoryFiltersMobileSheet } from '@/components/inventory/InventoryFiltersMobileSheet';
import type { Filters } from '@/components/inventory/InventoryFilters';

vi.mock('@/hooks/useCustomers', () => ({
  useCustomers: () => ({ data: [], isLoading: false }),
}));
vi.mock('@/hooks/useJobs', () => ({
  useJobs: () => ({ data: [], isLoading: false }),
}));

describe('InventoryFiltersMobileSheet — AI chips', () => {
  it('toggles awaitingAi on click and applies on Apply', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    const filters: Filters = { state: [] };
    renderWithProviders(
      <InventoryFiltersMobileSheet open onOpenChange={() => {}} filters={filters} onApply={onApply} />,
    );
    await user.click(screen.getByRole('button', { name: /Awaiting AI/i }));
    await user.click(screen.getByRole('button', { name: /Apply filters/i }));
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ awaitingAi: true }));
  });

  it('toggles needsReview on click and applies on Apply', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    const filters: Filters = { state: [] };
    renderWithProviders(
      <InventoryFiltersMobileSheet open onOpenChange={() => {}} filters={filters} onApply={onApply} />,
    );
    await user.click(screen.getByRole('button', { name: /Needs review/i }));
    await user.click(screen.getByRole('button', { name: /Apply filters/i }));
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ needsReview: true }));
  });

  it('chips toggle independently — turning needsReview on leaves awaitingAi as-is', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    const filters: Filters = { state: [], awaitingAi: true };
    renderWithProviders(
      <InventoryFiltersMobileSheet open onOpenChange={() => {}} filters={filters} onApply={onApply} />,
    );
    await user.click(screen.getByRole('button', { name: /Needs review/i }));
    await user.click(screen.getByRole('button', { name: /Apply filters/i }));
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ awaitingAi: true, needsReview: true }));
  });

  it('Clear all resets both AI chips', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    const filters: Filters = { state: [], awaitingAi: true, needsReview: true };
    renderWithProviders(
      <InventoryFiltersMobileSheet open onOpenChange={() => {}} filters={filters} onApply={onApply} />,
    );
    await user.click(screen.getByRole('button', { name: /Clear all/i }));
    expect(onApply).toHaveBeenCalledWith({ state: [] });
  });
});
