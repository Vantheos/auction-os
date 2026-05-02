export type LotState = 'assigned' | 'unassigned' | 'sold' | 'picked-up' | 'not-sellable';

const TRANSITIONS: Record<LotState, LotState[]> = {
  assigned:       ['sold', 'unassigned', 'not-sellable'],
  // unassigned → assigned is reachable only via the move endpoint (which sets a
  // destination job). The change-state path can't fulfill it without violating
  // the state_tuple_consistent CHECK constraint, so it's not listed here.
  unassigned:     ['not-sellable'],
  sold:           ['picked-up', 'unassigned'],
  'picked-up':    [],
  'not-sellable': ['unassigned'],
};

export class LotStateError extends Error {
  constructor(public from: LotState, public to: LotState, public reason: string) {
    super(`Illegal transition ${from} → ${to}: ${reason}`);
    this.name = 'LotStateError';
  }
}

export function legalTransitions(from: LotState): LotState[] {
  return [...TRANSITIONS[from]];
}

export function validateTransition(from: LotState, to: LotState): void {
  if (from === to) {
    throw new LotStateError(from, to, 'no-op transition');
  }
  if (!TRANSITIONS[from].includes(to)) {
    throw new LotStateError(from, to, `not in legal transitions for ${from}`);
  }
}

// Returns states that are legal transitions for ALL lots in the array.
// Used by bulk Change-state UI per D-003.
export function sharedLegalTransitions(states: LotState[]): LotState[] {
  if (states.length === 0) return [];
  const sets = states.map((s) => new Set(TRANSITIONS[s]));
  const [first, ...rest] = sets;
  return [...first].filter((t) => rest.every((s) => s.has(t)));
}
