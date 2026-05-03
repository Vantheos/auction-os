// tests/client/patterns/04-role-gated-render.test.tsx
//
// PATTERN: A component renders or hides controls based on the value returned
// from `useRole`. This is the warehouse-vs-office-vs-admin permission gate
// that v1 spec §3 requires UI to honor (the server enforces too, but UI gates
// keep accidental clicks out of the failure path).
//
// `useRole` reads from a Supabase session, not a React Context, so we mock
// the whole `@/lib/auth` module rather than a provider.
//
// IMPORTANT — vi.hoisted: vi.mock is hoisted to the top of the file, which
// means a plain module-level `let` declared after vi.mock won't be the same
// binding the factory closes over. vi.hoisted() declares state that ALSO
// hoists, so the mock factory and the test body share one mutable object.
// (A plain `let` here works for the initial value but mutations from inside
// it() callbacks aren't observed by the mocked function.)
//
// HOW TO ADAPT for a real component:
//   - Replace `ToyDeleteButton` with the real component under test.
//   - Set `mockState.role` to each role that matters before rendering.
//   - Assert visibility of role-gated controls (queryByRole vs getByRole).

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { useRole } from '@/lib/auth';
import { renderWithProviders } from '../../helpers/render-with-providers';

const mockState = vi.hoisted(() => ({
  role: 'admin' as 'admin' | 'office' | 'warehouse' | null,
}));

vi.mock('@/lib/auth', () => ({
  useRole: () => mockState.role,
}));

beforeEach(() => {
  mockState.role = 'admin';
});

// --- Synthetic toy component ------------------------------------------------

function ToyDeleteButton() {
  const role = useRole();
  if (role !== 'admin') return null;
  return <button type="button">Delete</button>;
}

// --- Tests ------------------------------------------------------------------

describe('PATTERN — role-gated render', () => {
  it('renders the gated control for admin', () => {
    mockState.role = 'admin';
    renderWithProviders(<ToyDeleteButton />);
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
  });

  it('hides the gated control for warehouse', () => {
    mockState.role = 'warehouse';
    renderWithProviders(<ToyDeleteButton />);
    expect(
      screen.queryByRole('button', { name: 'Delete' }),
    ).not.toBeInTheDocument();
  });

  it('hides the gated control when no role is present', () => {
    mockState.role = null;
    renderWithProviders(<ToyDeleteButton />);
    expect(
      screen.queryByRole('button', { name: 'Delete' }),
    ).not.toBeInTheDocument();
  });
});
