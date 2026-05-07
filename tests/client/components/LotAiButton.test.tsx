// tests/client/components/LotAiButton.test.tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../helpers/render-with-providers';
import { mockApi, resetMockApi } from '../../helpers/mock-api';
import { LotAiButton } from '@/components/lot/LotAiButton';
import type { LotDTO } from '@shared/types';

vi.mock('@/lib/api', async () => ({
  api: (await import('../../helpers/mock-api')).apiMockImpl,
}));

// Mutable role for per-test override. The default 'admin' covers most cases;
// individual tests override for warehouse-hides scenario.
let currentRole: 'admin' | 'office' | 'warehouse' | null = 'admin';
vi.mock('@/lib/auth', () => ({
  useRole: () => currentRole,
  useSession: () => ({ session: null, loading: false }),
  roleFromSession: () => currentRole,
}));

const baseLot: LotDTO = {
  id: '11111111-1111-1111-1111-111111111111',
  jobId: null, customerId: null, customerName: null, jobNumber: null,
  lotNumber: null, quantity: 1, title: null, description: null, price: null,
  condition: 'used', ref1: null, ref2: null,
  specialNotesCategory: 'None', specialNotesText: null, untested: false,
  state: 'assigned', source: 'cataloging',
  lastAiRunStatus: null, lastAiRunError: null,
  aiProcessingStartedAt: null,
  intakeOperatorId: 'op', intakeTimestamp: '2026-05-06T00:00:00Z',
  createdAt: '2026-05-06T00:00:00Z', updatedAt: '2026-05-06T00:00:00Z',
};

beforeEach(() => { resetMockApi(); currentRole = 'admin'; });

describe('LotAiButton', () => {
  it('renders button when status null + assigned + admin', () => {
    currentRole = 'admin';
    renderWithProviders(<LotAiButton lot={baseLot} />);
    expect(screen.getByRole('button', { name: /Run AI/i })).toBeInTheDocument();
  });

  it('hides button for warehouse', () => {
    currentRole = 'warehouse';
    renderWithProviders(<LotAiButton lot={baseLot} />);
    expect(screen.queryByRole('button', { name: /Run AI/i })).not.toBeInTheDocument();
  });

  it('hides button when status non-null (no re-runs)', () => {
    renderWithProviders(<LotAiButton lot={{ ...baseLot, lastAiRunStatus: 'success' }} />);
    expect(screen.queryByRole('button', { name: /Run AI/i })).not.toBeInTheDocument();
  });

  it('hides button when state is sold', () => {
    renderWithProviders(<LotAiButton lot={{ ...baseLot, state: 'sold' }} />);
    expect(screen.queryByRole('button', { name: /Run AI/i })).not.toBeInTheDocument();
  });

  it('shows in-flight banner when ai_processing_started_at is fresh', () => {
    const fresh = new Date(Date.now() - 30_000).toISOString();
    renderWithProviders(<LotAiButton lot={{ ...baseLot, aiProcessingStartedAt: fresh }} />);
    expect(screen.getByText(/AI is generating content/i)).toBeInTheDocument();
  });

  it('shows button when ai_processing_started_at is stale (>5 min)', () => {
    const stale = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    renderWithProviders(<LotAiButton lot={{ ...baseLot, aiProcessingStartedAt: stale }} />);
    expect(screen.getByRole('button', { name: /Run AI/i })).toBeInTheDocument();
  });

  it('clicking button calls POST /ai/run', async () => {
    const user = userEvent.setup();
    let called = false;
    mockApi({
      'POST /ai/run': () => {
        called = true;
        return { ...baseLot, lastAiRunStatus: 'success' };
      },
    });
    renderWithProviders(<LotAiButton lot={baseLot} />);
    await user.click(screen.getByRole('button', { name: /Run AI/i }));
    await waitFor(() => expect(called).toBe(true));
  });

  it('disabled with tooltip when title + description + price are all populated', () => {
    renderWithProviders(<LotAiButton lot={{
      ...baseLot, title: 'Operator title', description: 'Operator description', price: '12.50',
    }} />);
    const btn = screen.getByRole('button', { name: /Run AI/i });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('title', 'Title, description, and price are all filled. Clear one to re-run AI.');
  });

  it('enabled when one of the three is missing (title NULL)', () => {
    renderWithProviders(<LotAiButton lot={{
      ...baseLot, title: null, description: 'Operator description', price: '12.50',
    }} />);
    expect(screen.getByRole('button', { name: /Run AI/i })).not.toBeDisabled();
  });

  it('enabled when title is empty-string (treated as missing)', () => {
    renderWithProviders(<LotAiButton lot={{
      ...baseLot, title: '', description: 'd', price: '1.00',
    }} />);
    expect(screen.getByRole('button', { name: /Run AI/i })).not.toBeDisabled();
  });

  it('enabled when title is whitespace-only (treated as missing)', () => {
    renderWithProviders(<LotAiButton lot={{
      ...baseLot, title: '   ', description: 'd', price: '1.00',
    }} />);
    expect(screen.getByRole('button', { name: /Run AI/i })).not.toBeDisabled();
  });

  it('enabled when price is NULL even if title + description are filled', () => {
    renderWithProviders(<LotAiButton lot={{
      ...baseLot, title: 't', description: 'd', price: null,
    }} />);
    expect(screen.getByRole('button', { name: /Run AI/i })).not.toBeDisabled();
  });
});
