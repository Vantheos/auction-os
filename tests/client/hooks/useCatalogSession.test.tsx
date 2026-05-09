// tests/client/hooks/useCatalogSession.test.tsx
// Regression: lotId must be URL-derived (not useState-backed) so two
// component instances calling useCatalogSession() converge on the same
// value when one of them calls setLot. Earlier the hook initialized
// lotId via useState(lotIdFromUrl); the URL update fired but the OTHER
// instance's useState stayed at its mount-time value, leaving
// EndSessionConfirm with hasInProgressLot=false even after a real lot
// existed. See useCatalogSession.ts header for the full rationale.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act } from '@testing-library/react';
import { useCatalogSession } from '@/hooks/useCatalogSession';
import { renderHookWithProviders } from '../../helpers/render-with-providers';
import { resetMockApi } from '../../helpers/mock-api';

vi.mock('@/lib/api', async () => ({
  api: (await import('../../helpers/mock-api')).apiMockImpl,
}));

beforeEach(() => resetMockApi());

describe('useCatalogSession — lotId is URL-derived', () => {
  it('reads lotId from the ?lot= URL param on mount', () => {
    const { result } = renderHookWithProviders(useCatalogSession, {
      initialEntries: ['/catalog/session?customer=c1&job=j1&lot=lot-A'],
    });
    expect(result.current.lotId).toBe('lot-A');
    expect(result.current.customerId).toBe('c1');
    expect(result.current.jobId).toBe('j1');
  });

  it('starts with lotId=null when the URL has no ?lot=', () => {
    const { result } = renderHookWithProviders(useCatalogSession, {
      initialEntries: ['/catalog/session?customer=c1&job=j1'],
    });
    expect(result.current.lotId).toBe(null);
  });

  it('setLot updates lotId on the calling instance', () => {
    const { result } = renderHookWithProviders(useCatalogSession, {
      initialEntries: ['/catalog/session?customer=c1&job=j1'],
    });
    expect(result.current.lotId).toBe(null);
    act(() => {
      result.current.setLot('lot-B', 11);
    });
    expect(result.current.lotId).toBe('lot-B');
    expect(result.current.lotNumber).toBe(11);
  });

  it('TWO instances of the hook see the same lotId after one calls setLot (regression)', () => {
    // Render two hook instances inside the same provider tree (single
    // MemoryRouter, single QueryClient). One calls setLot; the other
    // must see the new value via the URL subscription.
    const { result } = renderHookWithProviders(
      () => ({
        a: useCatalogSession(),
        b: useCatalogSession(),
      }),
      { initialEntries: ['/catalog/session?customer=c1&job=j1'] },
    );
    expect(result.current.a.lotId).toBe(null);
    expect(result.current.b.lotId).toBe(null);

    act(() => {
      result.current.a.setLot('lot-C', 12);
    });

    // The bug: pre-fix, b.lotId stayed null because b's useState was
    // never updated by a's setLot call. Post-fix, both derive lotId
    // from URL, so both converge.
    expect(result.current.a.lotId).toBe('lot-C');
    expect(result.current.b.lotId).toBe('lot-C');
  });

  it('advance clears lotId in both instances', () => {
    const { result } = renderHookWithProviders(
      () => ({
        a: useCatalogSession(),
        b: useCatalogSession(),
      }),
      { initialEntries: ['/catalog/session?customer=c1&job=j1&lot=lot-D'] },
    );
    expect(result.current.a.lotId).toBe('lot-D');
    expect(result.current.b.lotId).toBe('lot-D');

    act(() => {
      result.current.a.advance();
    });

    expect(result.current.a.lotId).toBe(null);
    expect(result.current.b.lotId).toBe(null);
  });

  it('lotNumber stays per-instance — but the falsy fallback in LotInProgress covers it', () => {
    // lotNumber is intentionally per-component-instance (only the
    // setLot caller's instance sets it). This test pins that contract:
    // a's setLot sets a.lotNumber, b.lotNumber stays null. LotInProgress
    // falls back to lotQ.data?.lotNumber for display, so this gap is OK.
    const { result } = renderHookWithProviders(
      () => ({
        a: useCatalogSession(),
        b: useCatalogSession(),
      }),
      { initialEntries: ['/catalog/session?customer=c1&job=j1'] },
    );
    act(() => {
      result.current.a.setLot('lot-E', 13);
    });
    expect(result.current.a.lotNumber).toBe(13);
    expect(result.current.b.lotNumber).toBe(null);
    // But lotId — the bug's actual culprit — converges via URL.
    expect(result.current.a.lotId).toBe('lot-E');
    expect(result.current.b.lotId).toBe('lot-E');
  });
});
