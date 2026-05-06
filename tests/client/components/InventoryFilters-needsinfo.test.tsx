// tests/client/components/InventoryFilters-needsinfo.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../helpers/render-with-providers';
import { InventoryFilters, type Filters } from '@/components/inventory/InventoryFilters';

// useCustomers / useJobs are queried inside the component; stub them so the
// tests don't require a /customers or /jobs API mock just to render.
vi.mock('@/hooks/useCustomers', () => ({
  useCustomers: () => ({ data: [], isLoading: false }),
}));
vi.mock('@/hooks/useJobs', () => ({
  useJobs: () => ({ data: [], isLoading: false }),
}));

describe('InventoryFilters Needs Info. chip', () => {
  it('toggles needsInfo on click', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const filters: Filters = { state: [] };
    renderWithProviders(<InventoryFilters filters={filters} onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: /Needs Info\./i }));
    expect(onChange).toHaveBeenCalledWith({ state: [], needsInfo: true });
  });

  it('Clear filters resets needsInfo', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const filters: Filters = { state: [], needsInfo: true };
    renderWithProviders(<InventoryFilters filters={filters} onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: /Clear filters/i }));
    expect(onChange).toHaveBeenCalledWith({ state: [] });
  });
});
