// tests/client/components/Settings.test.tsx
// Phase 4 Area 3 — component tests for the AI Schedule panel.
//
// Label Printer panel was already shipped in Phase 2 and remains unchanged;
// no new tests for it here. AI Schedule panel is the new surface.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Settings } from '@/routes/Settings';
import { renderWithProviders } from '../../helpers/render-with-providers';
import { mockApi, resetMockApi, getApiCalls } from '../../helpers/mock-api';
import type { SystemSettingsDTO } from '@shared/types';

vi.mock('@/lib/api', async () => ({
  api: (await import('../../helpers/mock-api')).apiMockImpl,
}));

beforeEach(() => resetMockApi());

function makeSettings(overrides: Partial<SystemSettingsDTO> = {}): SystemSettingsDTO {
  return {
    id: 1,
    aiScheduleEnabled: true,
    aiScheduleIntervalHours: 24,
    aiScheduleTimeOfDay: '23:00:00',
    aiLastRunAt: null,
    aiCostMtdCents: 0,
    aiCostLifetimeCents: 0,
    aiRunCountLifetime: 0,
    aiCostMtdStartedAt: '2026-05-03T00:00:00.000Z',
    aiRunLockUntil: null,
    labelPrinterHelperUrl: null,
    updatedAt: '2026-05-03T00:00:00.000Z',
    ...overrides,
  };
}

describe('Settings → AI Schedule panel', () => {
  it('renders form values from the server response', async () => {
    mockApi({
      'GET /system-settings': () => makeSettings({
        aiScheduleEnabled: true,
        aiScheduleIntervalHours: 8,
        aiScheduleTimeOfDay: '09:30:00',
      }),
    });

    renderWithProviders(<Settings />);
    await screen.findByRole('checkbox', { name: /AI scheduled runs enabled/i });

    const enabledCheckbox = screen.getByRole('checkbox', { name: /AI scheduled runs enabled/i }) as HTMLInputElement;
    const intervalSelect = screen.getByLabelText('Interval') as HTMLSelectElement;
    const timeInput = screen.getByLabelText('First run anchor (time of day)') as HTMLInputElement;

    expect(enabledCheckbox.checked).toBe(true);
    expect(intervalSelect.value).toBe('8');
    // Time input strips seconds for display
    expect(timeInput.value).toBe('09:30');
  });

  it('saves changed AI schedule values via PATCH', async () => {
    mockApi({
      'GET /system-settings': () => makeSettings(),
      'PATCH /system-settings': () => makeSettings({
        aiScheduleEnabled: false,
        aiScheduleIntervalHours: 12,
        aiScheduleTimeOfDay: '06:00:00',
      }),
    });

    const user = userEvent.setup();
    renderWithProviders(<Settings />, { withToaster: true });

    const enabledCheckbox = await screen.findByRole('checkbox', { name: /AI scheduled runs enabled/i });
    const intervalSelect = screen.getByLabelText('Interval') as HTMLSelectElement;
    const timeInput = screen.getByLabelText('First run anchor (time of day)') as HTMLInputElement;

    // Toggle off, change interval to 12, change time to 06:00
    await user.click(enabledCheckbox);
    await user.selectOptions(intervalSelect, '12');
    await user.clear(timeInput);
    await user.type(timeInput, '06:00');

    // The AI Schedule panel has its own Save button; pick the second one
    // (the Label Printer panel has its own Save above).
    const saveButtons = screen.getAllByRole('button', { name: 'Save changes' });
    await user.click(saveButtons[saveButtons.length - 1]);

    await waitFor(() => {
      const patch = getApiCalls().find(
        (c) => c.method === 'PATCH' && c.path === '/system-settings',
      );
      expect(patch).toBeDefined();
      const body = patch?.body as {
        aiScheduleEnabled: boolean;
        aiScheduleIntervalHours: number;
        aiScheduleTimeOfDay: string;
      };
      expect(body.aiScheduleEnabled).toBe(false);
      expect(body.aiScheduleIntervalHours).toBe(12);
      expect(body.aiScheduleTimeOfDay).toBe('06:00');
    });

    expect(await screen.findByText('Settings saved')).toBeInTheDocument();
  });

  it('AI schedule fields stay editable when enabled toggle is off', async () => {
    // Per spec §3.3: form is always editable regardless of toggle state —
    // toggle controls whether the cron runs; configuration is independent.
    mockApi({
      'GET /system-settings': () => makeSettings({ aiScheduleEnabled: false }),
    });

    renderWithProviders(<Settings />);
    await screen.findByRole('checkbox', { name: /AI scheduled runs enabled/i });

    const intervalSelect = screen.getByLabelText('Interval') as HTMLSelectElement;
    const timeInput = screen.getByLabelText('First run anchor (time of day)') as HTMLInputElement;

    expect(intervalSelect.disabled).toBe(false);
    expect(timeInput.disabled).toBe(false);
  });
});

describe('Settings → AI section structure', () => {
  it('renders the outer "AI" section heading', async () => {
    mockApi({ 'GET /system-settings': () => makeSettings() });
    renderWithProviders(<Settings />);
    expect(await screen.findByRole('heading', { level: 2, name: /^AI$/ })).toBeInTheDocument();
  });

  it('renders the Schedule sub-card heading (h3)', async () => {
    mockApi({ 'GET /system-settings': () => makeSettings() });
    renderWithProviders(<Settings />);
    expect(await screen.findByRole('heading', { level: 3, name: /Schedule/i })).toBeInTheDocument();
  });

  it('renders the Cost sub-card with values from the server response', async () => {
    mockApi({
      'GET /system-settings': () => makeSettings({
        aiCostMtdCents: 4567,                 // $45.67 MTD
        aiCostLifetimeCents: 1000,            // 1000c / 4 runs = 250c = $2.500 avg
        aiRunCountLifetime: 4,
      }),
    });
    renderWithProviders(<Settings />);
    expect(await screen.findByRole('heading', { level: 3, name: /Cost/i })).toBeInTheDocument();
    expect(screen.getByText('$45.67')).toBeInTheDocument();
    expect(screen.getByText('$2.500')).toBeInTheDocument();
  });

  it('renders the Run Now button', async () => {
    mockApi({ 'GET /system-settings': () => makeSettings() });
    renderWithProviders(<Settings />);
    expect(await screen.findByRole('button', { name: 'Run Now' })).toBeInTheDocument();
  });

  it('Run Now button is disabled while the backlog mutation is in flight', async () => {
    // Hold the backlog response open so isPending stays true after click;
    // we resolve the deferred at the end so the test doesn't leak.
    let resolveBacklog!: (v: unknown) => void;
    const pending = new Promise((r) => { resolveBacklog = r; });
    mockApi({
      'GET /system-settings': () => makeSettings(),
      'POST /ai/backlog': () => pending,
    });

    const user = userEvent.setup();
    renderWithProviders(<Settings />, { withToaster: true });

    const runNow = await screen.findByRole('button', { name: 'Run Now' });
    await user.click(runNow);

    // After click, the button text flips to "Running…" and is disabled.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Running…/ })).toBeDisabled();
    });

    resolveBacklog({ processed: 0, remaining: 0, errors: 0 });
  });
});
