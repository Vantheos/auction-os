// tests/client/components/JobEditDialog.test.tsx
// Phase 5 Area 3 — covers the job edit-dialog flow.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { JobEditDialog } from '@/components/jobs/JobEditDialog';
import { ToastProvider } from '@/components/ui/toast';
import { renderWithProviders } from '../../helpers/render-with-providers';
import { mockApi, resetMockApi, getApiCalls } from '../../helpers/mock-api';
import type { JobDTO } from '@shared/types';

vi.mock('@/lib/api', async () => ({
  api: (await import('../../helpers/mock-api')).apiMockImpl,
}));

beforeEach(() => resetMockApi());

function makeJob(overrides: Partial<JobDTO> = {}): JobDTO {
  return {
    id: 'job-1',
    customerId: 'cust-1',
    jobNumber: '2026-04-Smith-001',
    closedAt: null,
    startBid: '5.00',
    shippable: false,
    createdAt: '2026-05-04T12:00:00.000Z',
    updatedAt: '2026-05-04T12:00:00.000Z',
    ...overrides,
  };
}

function Harness({ job }: { job: JobDTO }) {
  const [open, setOpen] = useState(true);
  return (
    <ToastProvider>
      <JobEditDialog job={job} customerId="cust-1" open={open} onOpenChange={setOpen} />
    </ToastProvider>
  );
}

describe('JobEditDialog', () => {
  it('saves a startBid change via PATCH', async () => {
    mockApi({
      'PATCH /jobs/job-1': () => makeJob({ startBid: '12.50' }),
    });

    const user = userEvent.setup();
    renderWithProviders(<Harness job={makeJob()} />);

    const startBidInput = await screen.findByLabelText('Start Bid');
    await user.clear(startBidInput);
    // happy-dom strips trailing zeros from type=number inputs; '12.5' is
    // the survived form. Server regex accepts it; CSV formatter normalizes
    // to '12.50' at export.
    await user.type(startBidInput, '12.5');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      const patch = getApiCalls().find((c) => c.path === '/jobs/job-1' && c.method === 'PATCH');
      expect(patch).toBeDefined();
      expect(patch!.body).toEqual({ startBid: '12.5' });
    });
  });

  it('saves a shippable toggle via PATCH', async () => {
    mockApi({
      'PATCH /jobs/job-1': () => makeJob({ shippable: true }),
    });

    const user = userEvent.setup();
    renderWithProviders(<Harness job={makeJob()} />);

    await user.click(await screen.findByLabelText('Shippable lots'));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      const patch = getApiCalls().find((c) => c.path === '/jobs/job-1' && c.method === 'PATCH');
      expect(patch).toBeDefined();
      expect(patch!.body).toEqual({ shippable: true });
    });
  });

  it('saves jobNumber + startBid + shippable in one call', async () => {
    mockApi({
      'PATCH /jobs/job-1': () => makeJob({ jobNumber: 'RENAMED', startBid: '20.00', shippable: true }),
    });

    const user = userEvent.setup();
    renderWithProviders(<Harness job={makeJob()} />);

    const numberInput = await screen.findByLabelText('Job number');
    await user.clear(numberInput);
    await user.type(numberInput, 'RENAMED');

    const bidInput = screen.getByLabelText('Start Bid');
    await user.clear(bidInput);
    // type="number" inputs strip trailing zeros after decimal in some
    // engines; '20' is what survives. Server regex accepts integer form;
    // export-side formatCurrency normalizes to '20.00'.
    await user.type(bidInput, '20');

    await user.click(screen.getByLabelText('Shippable lots'));

    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      const patch = getApiCalls().find((c) => c.path === '/jobs/job-1' && c.method === 'PATCH');
      expect(patch).toBeDefined();
      expect(patch!.body).toEqual({
        jobNumber: 'RENAMED',
        startBid: '20',
        shippable: true,
      });
    });
  });

  it('disables Save button when startBid is malformed', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness job={makeJob()} />);

    const bidInput = await screen.findByLabelText('Start Bid');
    await user.clear(bidInput);
    await user.type(bidInput, 'abc');

    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('does not send any patch when nothing changed', async () => {
    let called = false;
    mockApi({
      'PATCH /jobs/job-1': () => {
        called = true;
        return makeJob();
      },
    });

    const user = userEvent.setup();
    renderWithProviders(<Harness job={makeJob()} />);
    await user.click(await screen.findByRole('button', { name: 'Save' }));

    // Save should close immediately without hitting the API
    await new Promise((r) => setTimeout(r, 50));
    expect(called).toBe(false);
  });
});
