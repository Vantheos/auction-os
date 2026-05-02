// src/hooks/useLotState.ts
import type { LotState } from '@shared/types';

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

export function legalTransitions(from: LotState): LotState[] {
  return [...TRANSITIONS[from]];
}

export function sharedLegalTransitions(states: LotState[]): LotState[] {
  if (states.length === 0) return [];
  const sets = states.map((s) => new Set(TRANSITIONS[s]));
  const [first, ...rest] = sets;
  return [...first].filter((t) => rest.every((s) => s.has(t)));
}

export const TERMINAL: LotState[] = ['picked-up', 'not-sellable'];

export function isTerminalTransition(to: LotState): boolean {
  return TERMINAL.includes(to);
}
