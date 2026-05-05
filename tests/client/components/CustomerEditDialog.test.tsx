// tests/client/components/CustomerEditDialog.test.tsx
// Phase 5 Area 2 — covers edit-dialog flows: name/sellerCode save,
// disable confirm, re-enable confirm, missing-sellerCode hint.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { CustomerEditDialog } from '@/components/customers/CustomerEditDialog';
import { ToastProvider } from '@/components/ui/toast';
import { renderWithProviders } from '../../helpers/render-with-providers';
import { mockApi, resetMockApi, getApiCalls } from '../../helpers/mock-api';
import type { CustomerDTO } from '@shared/types';

vi.mock('@/lib/api', async () => ({
  api: (await import('../../helpers/mock-api')).apiMockImpl,
}));

beforeEach(() => resetMockApi());

function makeCustomer(overrides: Partial<CustomerDTO> = {}): CustomerDTO {
  return {
    id: 'cust-1',
    name: 'Acme Co',
    sellerCode: 'ACME001',
    disabledAt: null,
    createdAt: '2026-05-04T12:00:00.000Z',
    updatedAt: '2026-05-04T12:00:00.000Z',
    ...overrides,
  };
}

// Wraps the dialog in an Open=true harness so tests can interact with it.
function Harness({ customer }: { customer: CustomerDTO }) {
  const [open, setOpen] = useState(true);
  return (
    <ToastProvider>
      <CustomerEditDialog customer={customer} open={open} onOpenChange={setOpen} />
    </ToastProvider>
  );
}

describe('CustomerEditDialog — name + sellerCode save', () => {
  it('saves a name change via PATCH', async () => {
    mockApi({
      'PATCH /customers/cust-1': () => makeCustomer({ name: 'Acme Renamed' }),
    });

    const user = userEvent.setup();
    renderWithProviders(<Harness customer={makeCustomer()} />);

    const nameInput = await screen.findByLabelText('Name');
    await user.clear(nameInput);
    await user.type(nameInput, 'Acme Renamed');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      const calls = getApiCalls();
      const patch = calls.find((c) => c.path === '/customers/cust-1' && c.method === 'PATCH');
      expect(patch).toBeDefined();
      expect(patch!.body).toEqual({ name: 'Acme Renamed' });
    });
  });

  it('saves a sellerCode change via PATCH', async () => {
    mockApi({
      'PATCH /customers/cust-1': () => makeCustomer({ sellerCode: 'NEW001' }),
    });

    const user = userEvent.setup();
    renderWithProviders(<Harness customer={makeCustomer()} />);

    const codeInput = await screen.findByLabelText('Seller Code');
    await user.clear(codeInput);
    await user.type(codeInput, 'NEW001');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      const patch = getApiCalls().find((c) => c.path === '/customers/cust-1' && c.method === 'PATCH');
      expect(patch).toBeDefined();
      expect(patch!.body).toEqual({ sellerCode: 'NEW001' });
    });
  });

  it('does not send sellerCode when blanked on a customer that has one', async () => {
    // Defensive: Save with a blanked-out sellerCode field for an existing
    // customer should not send sellerCode at all (server would reject empty
    // string with 400). We only send fields that have non-empty changed values.
    mockApi({
      'PATCH /customers/cust-1': () => makeCustomer({ name: 'Renamed' }),
    });

    const user = userEvent.setup();
    renderWithProviders(<Harness customer={makeCustomer()} />);

    await user.clear(await screen.findByLabelText('Seller Code'));
    const nameInput = screen.getByLabelText('Name');
    await user.clear(nameInput);
    await user.type(nameInput, 'Renamed');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      const patch = getApiCalls().find((c) => c.path === '/customers/cust-1' && c.method === 'PATCH');
      expect(patch).toBeDefined();
      const body = patch!.body as Record<string, unknown>;
      expect(body).toEqual({ name: 'Renamed' });
      expect(body.sellerCode).toBeUndefined();
    });
  });
});

describe('CustomerEditDialog — disable / re-enable', () => {
  it('shows missing-sellerCode hint when sellerCode is null and field is empty', async () => {
    renderWithProviders(<Harness customer={makeCustomer({ sellerCode: null })} />);

    expect(
      await screen.findByText(/Seller Code is required before exporting jobs/i),
    ).toBeInTheDocument();
  });

  it('clicks Disable → confirm → calls PATCH with disabled=true', async () => {
    mockApi({
      'PATCH /customers/cust-1': () => makeCustomer({ disabledAt: '2026-05-04T13:00:00.000Z' }),
    });

    const user = userEvent.setup();
    renderWithProviders(<Harness customer={makeCustomer()} />);

    await user.click(await screen.findByRole('button', { name: /Disable customer/i }));
    // Confirm dialog appears
    expect(await screen.findByText(/Disable Acme Co\?/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Disable' }));

    await waitFor(() => {
      const patch = getApiCalls().find((c) => c.path === '/customers/cust-1' && c.method === 'PATCH');
      expect(patch).toBeDefined();
      expect(patch!.body).toEqual({ disabled: true });
    });
  });

  it('disabled customer shows Re-enable button + confirm flow', async () => {
    mockApi({
      'PATCH /customers/cust-1': () => makeCustomer({ disabledAt: null }),
    });

    const user = userEvent.setup();
    renderWithProviders(
      <Harness customer={makeCustomer({ disabledAt: '2026-05-04T13:00:00.000Z' })} />,
    );

    await user.click(await screen.findByRole('button', { name: /Re-enable customer/i }));
    expect(await screen.findByText(/Re-enable Acme Co\?/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Re-enable' }));

    await waitFor(() => {
      const patch = getApiCalls().find((c) => c.path === '/customers/cust-1' && c.method === 'PATCH');
      expect(patch).toBeDefined();
      expect(patch!.body).toEqual({ disabled: false });
    });
  });
});
