// src/lib/role.ts
// Central role helpers mirroring v1 spec §3 permission matrix. Both the
// route gate (ProtectedRoute roles prop) and the state-change menu
// transition filter source from this single module.

import type { LotState } from '@shared/types';

export type Role = 'admin' | 'office' | 'warehouse';

/**
 * Where each role lands after login (and where they're redirected to on
 * a failed route gate). Warehouse is mobile-primary so they hit the
 * cataloging entry point directly.
 */
export function homeRouteFor(role: Role): string {
  return role === 'warehouse' ? '/catalog' : '/inventory';
}

/**
 * Lot state transitions a given role is permitted to trigger.
 * Per v1 spec §3: warehouse cannot mark sold/picked-up/not-sellable.
 * Office and admin can trigger any legal transition the state machine
 * permits (the state machine itself is authoritative for legality).
 */
export function transitionsAllowedForRole(role: Role, candidates: LotState[]): LotState[] {
  if (role !== 'warehouse') return candidates;
  return candidates.filter((s) => s !== 'sold' && s !== 'picked-up' && s !== 'not-sellable');
}

/**
 * Whether a role is permitted to trigger ANY state change on lots.
 * Warehouse cannot trigger the gating transitions, so the menu is hidden
 * entirely for them. (LotState is unused here today but kept in the
 * signature for future per-state policy if the matrix evolves.)
 */
export function canChangeState(role: Role, _fromState: LotState): boolean {
  if (role !== 'warehouse') return true;
  // Warehouse can only do `unassigned → assigned` (via Move) — no direct
  // state transitions through the state-change menu.
  return false;
}

/**
 * Boolean check for whether a role may delete lots.
 */
export function canDeleteLot(role: Role): boolean {
  return role === 'admin';
}
