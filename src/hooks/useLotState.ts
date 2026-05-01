// src/hooks/useLotState.ts
import type { LotState } from '@shared/types';

const TRANSITIONS: Record<LotState, LotState[]> = {
  assigned:       ['sold', 'unassigned', 'not-sellable'],
  unassigned:     ['assigned', 'not-sellable'],
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
