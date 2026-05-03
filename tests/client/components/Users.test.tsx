// tests/client/components/Users.test.tsx
// Phase 4 Area 2 — component tests for the /users page.
// Covers: list renders, new-user dialog flow, role-change confirm, disable
// confirm, self-row hides disable button (foot-gun prevention).

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Users } from '@/routes/Users';
import { renderWithProviders } from '../../helpers/render-with-providers';
import { mockApi, resetMockApi, getApiCalls } from '../../helpers/mock-api';
import type { UserDTO } from '@shared/types';

vi.mock('@/lib/api', async () => ({
  api: (await import('../../helpers/mock-api')).apiMockImpl,
}));

// useSession is what Users.tsx uses to identify the current admin (for the
// self-row hides-disable-button rule). Mock it to return a known session.
const mockSession = vi.hoisted(() => ({
  userId: 'admin-self' as string,
}));

vi.mock('@/lib/auth', () => ({
  useSession: () => ({
    session: { user: { id: mockSession.userId, email: 'admin@example.com' } },
    loading: false,
  }),
}));

beforeEach(() => {
  resetMockApi();
  mockSession.userId = 'admin-self';
});

function makeUser(overrides: Partial<UserDTO> = {}): UserDTO {
  return {
    id: 'user-1',
    role: 'office',
    displayName: 'Office User',
    email: 'office@example.com',
    disabledAt: null,
    createdAt: '2026-05-01T12:00:00.000Z',
    updatedAt: '2026-05-01T12:00:00.000Z',
    ...overrides,
  };
}

describe('Users page', () => {
  it('renders the list of users with email + role + status', async () => {
    mockApi({
      'GET /users': () => ({
        users: [
          makeUser({ id: 'admin-self', displayName: 'Me', role: 'admin', email: 'me@example.com' }),
          makeUser({ id: 'u2', displayName: 'Other', role: 'office', email: 'other@example.com' }),
          makeUser({ id: 'u3', displayName: 'Disabled User', role: 'warehouse', disabledAt: '2026-05-02T00:00:00.000Z' }),
        ],
      }),
    });

    renderWithProviders(<Users />);
    expect(await screen.findByText('Me')).toBeInTheDocument();
    expect(await screen.findByText('Other')).toBeInTheDocument();
    expect(await screen.findByText('Disabled User')).toBeInTheDocument();
    expect(await screen.findByText('me@example.com')).toBeInTheDocument();
    expect(screen.getByText('Disabled')).toBeInTheDocument();
  });

  it('hides the Disable button on the admin\'s own row', async () => {
    mockApi({
      'GET /users': () => ({
        users: [
          makeUser({ id: 'admin-self', displayName: 'Me', role: 'admin' }),
          makeUser({ id: 'u2', displayName: 'Other', role: 'office' }),
        ],
      }),
    });

    renderWithProviders(<Users />);
    await screen.findByText('Me');
    // There should be exactly ONE Disable button (for "Other"), not two.
    // The admin's own row hides the toggle to prevent self-disable foot-gun.
    const disableButtons = screen.getAllByRole('button', { name: 'Disable' });
    expect(disableButtons).toHaveLength(1);
  });

  it('opens the new-user dialog and creates a user', async () => {
    mockApi({
      'GET /users': () => ({ users: [] }),
      'POST /users': () => makeUser({ id: 'new', email: 'new@example.com', displayName: 'New User' }),
    });

    const user = userEvent.setup();
    renderWithProviders(<Users />, { withToaster: true });

    await user.click(screen.getByRole('button', { name: 'New user' }));
    await user.type(screen.getByLabelText('Email'), 'new@example.com');
    await user.type(screen.getByLabelText('Initial password'), 'hunter22hunter22');
    await user.type(screen.getByLabelText('Display name'), 'New User');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() =>
      expect(getApiCalls().some((c) => c.method === 'POST' && c.path === '/users')).toBe(true),
    );
    // Toast surfaces the initial password back to the admin
    expect(await screen.findByText('User created')).toBeInTheDocument();
    expect(await screen.findByText(/Initial password: hunter22hunter22/)).toBeInTheDocument();
  });

  it('role change opens a confirm dialog; canceling does NOT save', async () => {
    mockApi({
      'GET /users': () => ({ users: [makeUser({ id: 'u2', role: 'office' })] }),
    });

    const user = userEvent.setup();
    renderWithProviders(<Users />);
    await screen.findByText('Office User');

    const roleSelect = screen.getByRole('combobox') as HTMLSelectElement;
    await user.selectOptions(roleSelect, 'warehouse');

    expect(await screen.findByText("Change Office User's role?")).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    // No PATCH should have fired
    expect(getApiCalls().some((c) => c.method === 'PATCH')).toBe(false);
  });

  it('role change confirm fires the PATCH', async () => {
    mockApi({
      'GET /users': () => ({ users: [makeUser({ id: 'u2', role: 'office' })] }),
      'PATCH /users/u2': () => makeUser({ id: 'u2', role: 'warehouse' }),
    });

    const user = userEvent.setup();
    renderWithProviders(<Users />, { withToaster: true });
    await screen.findByText('Office User');

    const roleSelect = screen.getByRole('combobox') as HTMLSelectElement;
    await user.selectOptions(roleSelect, 'warehouse');
    await screen.findByText("Change Office User's role?");
    await user.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() =>
      expect(getApiCalls().some((c) => c.method === 'PATCH' && c.path === '/users/u2')).toBe(true),
    );
    expect(await screen.findByText('Role updated')).toBeInTheDocument();
  });

  it('disable button opens a confirm dialog; canceling does NOT save', async () => {
    mockApi({
      'GET /users': () => ({ users: [makeUser({ id: 'u2' })] }),
    });

    const user = userEvent.setup();
    renderWithProviders(<Users />);
    await screen.findByText('Office User');

    await user.click(screen.getByRole('button', { name: 'Disable' }));
    expect(await screen.findByText('Disable Office User?')).toBeInTheDocument();

    // Multiple "Cancel" buttons could exist (closed dialogs hidden); query
    // by the visible one in the open dialog
    const cancelButtons = screen.getAllByRole('button', { name: 'Cancel' });
    await user.click(cancelButtons[cancelButtons.length - 1]);

    expect(getApiCalls().some((c) => c.method === 'PATCH')).toBe(false);
  });

  it('disable confirm fires PATCH disabled=true', async () => {
    mockApi({
      'GET /users': () => ({ users: [makeUser({ id: 'u2' })] }),
      'PATCH /users/u2': () => makeUser({ id: 'u2', disabledAt: '2026-05-03T00:00:00.000Z' }),
    });

    const user = userEvent.setup();
    renderWithProviders(<Users />, { withToaster: true });
    await screen.findByText('Office User');

    await user.click(screen.getByRole('button', { name: 'Disable' }));
    await screen.findByText('Disable Office User?');

    // The dialog has its own destructive Disable button (in the DialogFooter)
    const disableButtons = screen.getAllByRole('button', { name: 'Disable' });
    await user.click(disableButtons[disableButtons.length - 1]);

    await waitFor(() =>
      expect(
        getApiCalls().some(
          (c) =>
            c.method === 'PATCH' &&
            c.path === '/users/u2' &&
            (c.body as { disabled: boolean }).disabled === true,
        ),
      ).toBe(true),
    );
    expect(await screen.findByText('User disabled')).toBeInTheDocument();
  });
});
