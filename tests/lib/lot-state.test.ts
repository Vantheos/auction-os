import { describe, it, expect } from 'vitest';
import { legalTransitions, validateTransition, LotStateError } from '../../api/_lib/lot-state';

describe('legalTransitions', () => {
  it('assigned → sold, unassigned, not-sellable', () => {
    expect(legalTransitions('assigned').sort()).toEqual(['not-sellable', 'sold', 'unassigned']);
  });
  it('unassigned → assigned, not-sellable', () => {
    expect(legalTransitions('unassigned').sort()).toEqual(['assigned', 'not-sellable']);
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
