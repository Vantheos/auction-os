// tests/client/components/InventoryFilters.test.tsx
// Phase 5: covers the new `actions` slot used by Inventory.tsx to host the
// per-job Export to AF360 button when a specific Job is filtered. Also
// verifies the Clear filters button moved to before the actions slot
// (used to be at ml-auto far-right).

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { InventoryFilters, type Filters } from '@/components/inventory/InventoryFilters';
import { renderWithProviders } from '../../helpers/render-with-providers';
import { mockApi, resetMockApi } from '../../helpers/mock-api';

vi.mock('@/lib/api', async () => ({
  api: (await import('../../helpers/mock-api')).apiMockImpl,
}));

beforeEach(() => {
  resetMockApi();
  // useCustomers + useJobs both fetch from /customers and /jobs?customerId=
  mockApi({
    'GET /customers': () => ({ customers: [] }),
    // useJobs only fires when customerId is set; safe default empty.
    'GET /jobs': () => ({ jobs: [] }),
  });
});

const baseFilters: Filters = { state: [] };

describe('InventoryFilters — actions slot', () => {
  it('renders the actions slot when provided', () => {
    renderWithProviders(
      <InventoryFilters
        filters={baseFilters}
        onChange={() => {}}
        actions={<button>Export to AF360</button>}
      />
    );
    expect(screen.getByRole('button', { name: 'Export to AF360' })).toBeInTheDocument();
  });

  it('does not render the actions slot when not provided', () => {
    renderWithProviders(
      <InventoryFilters filters={baseFilters} onChange={() => {}} />
    );
    expect(screen.queryByRole('button', { name: 'Export to AF360' })).not.toBeInTheDocument();
  });

  it('Clear filters appears in the row when at least one filter is active', () => {
    renderWithProviders(
      <InventoryFilters
        filters={{ ...baseFilters, state: ['assigned'] }}
        onChange={() => {}}
      />
    );
    expect(screen.getByRole('button', { name: /Clear filters/i })).toBeInTheDocument();
  });

  it('Clear filters is hidden when no filters active', () => {
    renderWithProviders(
      <InventoryFilters filters={baseFilters} onChange={() => {}} />
    );
    expect(screen.queryByRole('button', { name: /Clear filters/i })).not.toBeInTheDocument();
  });
});
