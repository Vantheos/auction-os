// tests/client/components/InventoryFilters-ai-filters.test.tsx
// REQ-1 (2026-05-06): the legacy "Needs Info." single chip is replaced by
// two independent chips — "Awaiting AI" and "Needs review."
import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../helpers/render-with-providers';
import { InventoryFilters, type Filters } from '@/components/inventory/InventoryFilters';

vi.mock('@/hooks/useCustomers', () => ({
  useCustomers: () => ({ data: [], isLoading: false }),
}));
vi.mock('@/hooks/useJobs', () => ({
  useJobs: () => ({ data: [], isLoading: false }),
}));

describe('InventoryFilters AI chips', () => {
  it('toggles awaitingAi on click', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const filters: Filters = { state: [] };
    renderWithProviders(<InventoryFilters filters={filters} onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: /Awaiting AI/i }));
    expect(onChange).toHaveBeenCalledWith({ state: [], awaitingAi: true });
  });

  it('toggles needsReview on click', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const filters: Filters = { state: [] };
    renderWithProviders(<InventoryFilters filters={filters} onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: /Needs review/i }));
    expect(onChange).toHaveBeenCalledWith({ state: [], needsReview: true });
  });

  it('chips toggle independently — each is a separate boolean', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const filters: Filters = { state: [], awaitingAi: true };
    renderWithProviders(<InventoryFilters filters={filters} onChange={onChange} />);
    // Toggling needsReview leaves awaitingAi on.
    await user.click(screen.getByRole('button', { name: /Needs review/i }));
    expect(onChange).toHaveBeenCalledWith({ state: [], awaitingAi: true, needsReview: true });
  });

  it('Clear filters resets both AI chips', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const filters: Filters = { state: [], awaitingAi: true, needsReview: true };
    renderWithProviders(<InventoryFilters filters={filters} onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: /Clear filters/i }));
    expect(onChange).toHaveBeenCalledWith({ state: [] });
  });

  it('the legacy "Needs Info." chip is gone', async () => {
    const onChange = vi.fn();
    const filters: Filters = { state: [] };
    renderWithProviders(<InventoryFilters filters={filters} onChange={onChange} />);
    expect(screen.queryByRole('button', { name: /Needs Info\./i })).toBeNull();
  });
});
