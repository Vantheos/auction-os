// tests/client/components/AiCostPanel.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AiCostPanel } from '../../../src/components/settings/AiCostPanel';
import type { SystemSettingsDTO } from '../../../shared/types';

const base: SystemSettingsDTO = {
  id: 1,
  aiScheduleEnabled: true, aiScheduleIntervalHours: 24, aiScheduleTimeOfDay: '23:00:00',
  aiLastRunAt: null,
  aiCostMtdCents: 0, aiCostLifetimeCents: 0, aiRunCountLifetime: 0,
  aiCostMtdStartedAt: '2026-05-01T00:00:00Z', aiRunLockUntil: null,
  aiDrainInProgress: false, aiPendingLotCount: 0,
  labelPrinterHelperUrl: null, updatedAt: '2026-05-06T00:00:00Z',
};

describe('AiCostPanel', () => {
  it('renders MTD cost in dollars', () => {
    render(<AiCostPanel settings={{ ...base, aiCostMtdCents: 1234 }} />);
    expect(screen.getByText('$12.34')).toBeInTheDocument();
  });

  it('shows "no data yet" when run count is zero', () => {
    render(<AiCostPanel settings={base} />);
    expect(screen.getByText(/no data yet/i)).toBeInTheDocument();
  });

  it('renders 3-decimal average per lot when run count > 0', () => {
    render(<AiCostPanel settings={{ ...base, aiCostLifetimeCents: 320, aiRunCountLifetime: 10 }} />);
    // 320 / 10 = 32 cents → $0.320
    expect(screen.getByText('$0.320')).toBeInTheDocument();
  });
});
