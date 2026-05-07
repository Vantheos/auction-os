// tests/client/components/JobExportButton.test.tsx
//
// Phase 5 Area 6 — covers the JobExportButton:
//   - hidden for warehouse role
//   - visible for admin/office
//   - click triggers export hook
//   - error state renders Retry button + Cancel
//   - "Export complete" shown briefly after done

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { JobExportButton } from '@/components/jobs/JobExportButton';
import { ToastProvider } from '@/components/ui/toast';
import { renderWithProviders } from '../../helpers/render-with-providers';
import { mockApi, resetMockApi } from '../../helpers/mock-api';
import type { JobDTO, CustomerDTO } from '@shared/types';

vi.mock('@/lib/api', async () => ({
  api: (await import('../../helpers/mock-api')).apiMockImpl,
}));

const mockRole = vi.hoisted(() => ({ value: 'admin' as 'admin' | 'office' | 'warehouse' | null }));
vi.mock('@/lib/auth', () => ({
  useRole: () => mockRole.value,
  useSession: () => ({ session: null, loading: false }),
}));

beforeEach(() => {
  resetMockApi();
  mockRole.value = 'admin';
  // Stubs needed for the hook's anchor download trigger
  globalThis.URL.createObjectURL = vi.fn(() => 'blob:fake');
  globalThis.URL.revokeObjectURL = vi.fn();
  HTMLAnchorElement.prototype.click = vi.fn();
});

const customer: CustomerDTO = {
  id: 'cust-1',
  name: 'Acme',
  sellerCode: 'ACME001',
  disabledAt: null,
  createdAt: '2026-05-04T12:00:00.000Z',
  updatedAt: '2026-05-04T12:00:00.000Z',
};

const job: JobDTO = {
  id: 'job-1',
  customerId: 'cust-1',
  jobNumber: 'JOB-001',
  closedAt: null,
  startBid: '5.00',
  shippable: false,
  createdAt: '2026-05-04T12:00:00.000Z',
  updatedAt: '2026-05-04T12:00:00.000Z',
};

function Harness({ job: jobOverride }: { job?: JobDTO } = {}) {
  return (
    <ToastProvider>
      <JobExportButton job={jobOverride ?? job} customer={customer} />
    </ToastProvider>
  );
}

describe('JobExportButton — visibility', () => {
  it('renders for admin', () => {
    mockRole.value = 'admin';
    renderWithProviders(<Harness />);
    expect(screen.getByRole('button', { name: /Export to AF360/i })).toBeInTheDocument();
  });

  it('renders for office', () => {
    mockRole.value = 'office';
    renderWithProviders(<Harness />);
    expect(screen.getByRole('button', { name: /Export to AF360/i })).toBeInTheDocument();
  });

  it('hidden for warehouse', () => {
    mockRole.value = 'warehouse';
    const { container } = renderWithProviders(<Harness />);
    expect(container.querySelector('button')).toBeNull();
  });
});

describe('JobExportButton — strict export-ready gate', () => {
  const TOOLTIP = 'Job has lots that are not assigned or are missing title/description/price';

  it('disabled when totalLotCount is 0 (empty job)', () => {
    renderWithProviders(<Harness job={{ ...job, totalLotCount: 0, exportReadyLotCount: 0 }} />);
    const btn = screen.getByRole('button', { name: /Export to AF360/i });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('title', TOOLTIP);
  });

  it('disabled when some lots are not yet ready (exportReady < total)', () => {
    renderWithProviders(<Harness job={{ ...job, totalLotCount: 5, exportReadyLotCount: 3 }} />);
    const btn = screen.getByRole('button', { name: /Export to AF360/i });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('title', TOOLTIP);
  });

  it('disabled when any lot is in a non-assigned state (sold/picked-up reduces ready below total)', () => {
    renderWithProviders(<Harness job={{ ...job, totalLotCount: 4, exportReadyLotCount: 3 }} />);
    expect(screen.getByRole('button', { name: /Export to AF360/i })).toBeDisabled();
  });

  it('enabled only when every lot is assigned + complete (exportReady === total)', () => {
    renderWithProviders(<Harness job={{ ...job, totalLotCount: 5, exportReadyLotCount: 5 }} />);
    expect(screen.getByRole('button', { name: /Export to AF360/i })).not.toBeDisabled();
  });

  it('enabled when counts are undefined (legacy DTO shape — fail open)', () => {
    // Stale caches or other endpoints that don't compute the counts must not
    // accidentally lock out the export — undefined means "unknown."
    renderWithProviders(<Harness job={{ ...job, totalLotCount: undefined, exportReadyLotCount: undefined }} />);
    expect(screen.getByRole('button', { name: /Export to AF360/i })).not.toBeDisabled();
  });
});

describe('JobExportButton — interactive flow', () => {
  it('shows error state with Retry batch button when a batch fails', async () => {
    mockApi({
      'POST /jobs/job-1/export-af360/start': () => ({
        csv: 'h\r\n',
        csvFilename: 'X.csv',
        batchSize: 100,
        totalBatches: 1,
        totalLots: 5,
        batches: [{ batchNum: 1, lotIds: ['l1'] }],
        exportLabel: 'X',
      }),
      'POST /jobs/job-1/export-af360/batch': () => {
        throw new Error('EXPORT_FAILED');
      },
    });

    const user = userEvent.setup();
    renderWithProviders(<Harness />);
    await user.click(screen.getByRole('button', { name: /Export to AF360/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Retry batch 1/i })).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /Cancel/i })).toBeInTheDocument();
  });

  it('shows generic Retry export when /start fails (no failedBatchNum)', async () => {
    mockApi({
      'POST /jobs/job-1/export-af360/start': () => {
        throw new Error('SELLER_CODE_REQUIRED');
      },
    });

    const user = userEvent.setup();
    renderWithProviders(<Harness />);
    await user.click(screen.getByRole('button', { name: /Export to AF360/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Retry export/i })).toBeInTheDocument();
    });
  });

  it('clicking Retry export after /start failure triggers a new /start call', async () => {
    let startCallCount = 0;
    mockApi({
      'POST /jobs/job-1/export-af360/start': () => {
        startCallCount++;
        throw new Error('NO_LOTS');
      },
    });

    const user = userEvent.setup();
    renderWithProviders(<Harness />);

    // First export attempt → /start fails → button shows "Retry export"
    await user.click(screen.getByRole('button', { name: /Export to AF360/i }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Retry export/i })).toBeInTheDocument();
    });
    expect(startCallCount).toBe(1);

    // Click Retry → should fire a fresh /start call (NOT a no-op
    // retryFromBatch with empty ctxRef)
    await user.click(screen.getByRole('button', { name: /Retry export/i }));

    await waitFor(() => expect(startCallCount).toBe(2));
    // Still in error state since /start fails again — Retry button stays
    expect(screen.getByRole('button', { name: /Retry export/i })).toBeInTheDocument();
  });

  it('shows "Export complete" after done', async () => {
    mockApi({
      'POST /jobs/job-1/export-af360/start': () => ({
        csv: 'h\r\n',
        csvFilename: 'X.csv',
        batchSize: 100,
        totalBatches: 1,
        totalLots: 5,
        batches: [{ batchNum: 1, lotIds: ['l1'] }],
        exportLabel: 'X',
      }),
      'POST /jobs/job-1/export-af360/batch': () => ({
        downloadUrl: 'https://blob.example.com/b1.zip',
        expiresAt: '2026-05-05T00:00:00Z',
        batchNum: 1,
        totalBatches: 1,
        filename: 'b1.zip',
        photoCount: 3,
      }),
    });

    const user = userEvent.setup();
    renderWithProviders(<Harness />);
    await user.click(screen.getByRole('button', { name: /Export to AF360/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Export complete/i })).toBeInTheDocument();
    });
  });
});
