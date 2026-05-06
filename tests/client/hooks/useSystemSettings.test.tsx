// tests/client/hooks/useSystemSettings.test.tsx
// Phase 4 Area 3 — invalidation + cache-update tests for the system-settings
// hook. Per docs/testing-policy.md.
//
// useUpdateSystemSettings uses onSuccess to setQueryData (rather than
// invalidateQueries). That's a deliberate optimization: the singleton row
// is small, the server returns it, and refetching would just re-fetch the
// same payload. Tests assert the cache is updated directly.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, waitFor } from '@testing-library/react';
import { useUpdateSystemSettings } from '@/hooks/useSystemSettings';
import { renderHookWithProviders } from '../../helpers/render-with-providers';
import { mockApi, resetMockApi } from '../../helpers/mock-api';
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
    aiDrainInProgress: false,
    aiPendingLotCount: 0,
    labelPrinterHelperUrl: null,
    updatedAt: '2026-05-03T00:00:00.000Z',
    ...overrides,
  };
}

describe('useUpdateSystemSettings', () => {
  it('writes the server-returned settings into the ["system-settings"] cache on success', async () => {
    const updated = makeSettings({ aiScheduleEnabled: false, aiScheduleIntervalHours: 8 });
    mockApi({ 'PATCH /system-settings': () => updated });

    const { result, queryClient } = renderHookWithProviders(() => useUpdateSystemSettings());
    queryClient.setQueryData(['system-settings'], makeSettings());

    act(() => {
      result.current.mutate({ aiScheduleEnabled: false, aiScheduleIntervalHours: 8 });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(queryClient.getQueryData<SystemSettingsDTO>(['system-settings'])).toEqual(updated);
  });

  it('does not corrupt the cache on error (server message preserved for toast)', async () => {
    mockApi({
      'PATCH /system-settings': () => {
        throw new Error('aiScheduleTimeOfDay invalid');
      },
    });

    const { result, queryClient } = renderHookWithProviders(() => useUpdateSystemSettings());
    const original = makeSettings();
    queryClient.setQueryData(['system-settings'], original);

    act(() => {
      result.current.mutate({ aiScheduleTimeOfDay: 'bogus' });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    // Cache untouched — onSuccess didn't fire
    expect(queryClient.getQueryData(['system-settings'])).toEqual(original);
    // Error message available for the toast layer
    expect(result.current.error?.message).toBe('aiScheduleTimeOfDay invalid');
  });
});
