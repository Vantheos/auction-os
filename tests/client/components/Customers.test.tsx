// tests/client/components/Customers.test.tsx
// Phase 4 Area 5 — covers the customer-list polish: whole-row click
// navigation, customer search filter, and empty-state copy.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Routes, Route } from 'react-router-dom';
import { Customers } from '@/routes/Customers';
import { renderWithProviders } from '../../helpers/render-with-providers';
import { mockApi, resetMockApi } from '../../helpers/mock-api';
import type { CustomerDTO } from '@shared/types';

vi.mock('@/lib/api', async () => ({
  api: (await import('../../helpers/mock-api')).apiMockImpl,
}));

beforeEach(() => resetMockApi());

function makeCustomer(overrides: Partial<CustomerDTO> = {}): CustomerDTO {
  return {
    id: 'cust-1',
    name: 'Acme Co',
    createdAt: '2026-05-01T12:00:00.000Z',
    updatedAt: '2026-05-01T12:00:00.000Z',
    ...overrides,
  };
}

describe('Customers page', () => {
  it('renders the discoverability description text', async () => {
    mockApi({ 'GET /customers': () => ({ customers: [] }) });

    renderWithProviders(<Customers />);
    expect(
      await screen.findByText(/Click a customer row to view and manage their jobs/i),
    ).toBeInTheDocument();
  });

  it('clicking a customer row navigates to /customers/:id', async () => {
    mockApi({
      'GET /customers': () => ({
        customers: [makeCustomer({ id: 'cust-42', name: 'Acme Co' })],
      }),
    });

    const user = userEvent.setup();
    // Use a routes wrapper that renders a marker on the detail route, so
    // we can assert the navigation completed.
    renderWithProviders(
      <Routes>
        <Route path="/" element={<Customers />} />
        <Route path="/customers/:id" element={<div data-testid="detail-page">Detail</div>} />
      </Routes>,
    );

    const row = (await screen.findByText('Acme Co')).closest('tr');
    if (!row) throw new Error('customer row not found');
    await user.click(row);

    await waitFor(() => {
      expect(screen.getByTestId('detail-page')).toBeInTheDocument();
    });
  });

  it('search filters the customer list (case-insensitive substring on name)', async () => {
    mockApi({
      'GET /customers': () => ({
        customers: [
          makeCustomer({ id: 'a', name: 'Acme Co' }),
          makeCustomer({ id: 'b', name: 'Bravo LLC' }),
          makeCustomer({ id: 'c', name: 'Acme East' }),
        ],
      }),
    });

    const user = userEvent.setup();
    renderWithProviders(<Customers />);
    await screen.findByText('Acme Co');
    expect(screen.getByText('Bravo LLC')).toBeInTheDocument();

    const search = screen.getByPlaceholderText(/Search customers/i);
    await user.type(search, 'acme');

    await waitFor(() => {
      expect(screen.getByText('Acme Co')).toBeInTheDocument();
      expect(screen.getByText('Acme East')).toBeInTheDocument();
      expect(screen.queryByText('Bravo LLC')).not.toBeInTheDocument();
    });
  });

  it('shows search-specific empty-state copy when no customers match', async () => {
    mockApi({
      'GET /customers': () => ({
        customers: [makeCustomer({ id: 'a', name: 'Acme Co' })],
      }),
    });

    const user = userEvent.setup();
    renderWithProviders(<Customers />);
    await screen.findByText('Acme Co');

    await user.type(screen.getByPlaceholderText(/Search customers/i), 'xyz');

    expect(await screen.findByText("No customers match 'xyz'")).toBeInTheDocument();
  });
});
