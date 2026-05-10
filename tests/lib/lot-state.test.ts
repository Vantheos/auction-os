import { describe, it, expect } from 'vitest';
import {
  legalTransitions,
  stateTransitionFields,
  validateTransition,
  LotStateError,
} from '../../api/_lib/lot-state';

describe('legalTransitions', () => {
  it('assigned → sold, unassigned, not-sellable', () => {
    expect(legalTransitions('assigned').sort()).toEqual(['not-sellable', 'sold', 'unassigned']);
  });
  it('unassigned → not-sellable only (assigned is reachable only via move)', () => {
    expect(legalTransitions('unassigned').sort()).toEqual(['not-sellable']);
  });
  it('sold → picked-up, unassigned (D-001)', () => {
    expect(legalTransitions('sold').sort()).toEqual(['picked-up', 'unassigned']);
  });
  it('picked-up is terminal', () => {
    expect(legalTransitions('picked-up')).toEqual([]);
  });
  it('not-sellable → unassigned only', () => {
    expect(legalTransitions('not-sellable')).toEqual(['unassigned']);
  });
});

describe('validateTransition', () => {
  it('allows legal transition', () => {
    expect(() => validateTransition('assigned', 'sold')).not.toThrow();
  });
  it('throws LotStateError on illegal transition', () => {
    expect(() => validateTransition('picked-up', 'assigned')).toThrow(LotStateError);
  });
  it('throws LotStateError when same state', () => {
    expect(() => validateTransition('sold', 'sold')).toThrow(LotStateError);
  });
});

describe('stateTransitionFields', () => {
  it('clears jobId + lotNumber + labelReprintNeeded when transitioning to unassigned', () => {
    expect(stateTransitionFields('unassigned')).toEqual({
      state: 'unassigned',
      jobId: null,
      lotNumber: null,
      labelReprintNeeded: false,
    });
  });
  it('clears jobId + lotNumber + labelReprintNeeded when transitioning to not-sellable', () => {
    expect(stateTransitionFields('not-sellable')).toEqual({
      state: 'not-sellable',
      jobId: null,
      lotNumber: null,
      labelReprintNeeded: false,
    });
  });
  it('preserves jobId + lotNumber + labelReprintNeeded for assigned (no clear keys)', () => {
    expect(stateTransitionFields('assigned')).toEqual({ state: 'assigned' });
  });
  it('preserves jobId + lotNumber + labelReprintNeeded for sold and picked-up', () => {
    expect(stateTransitionFields('sold')).toEqual({ state: 'sold' });
    expect(stateTransitionFields('picked-up')).toEqual({ state: 'picked-up' });
  });
});
