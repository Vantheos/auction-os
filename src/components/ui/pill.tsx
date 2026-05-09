// src/components/ui/pill.tsx
import { cn } from '@/lib/utils';
import type { HTMLAttributes } from 'react';

// Mirrors the LotState union in api/_lib/lot-state.ts. Keep these two sources of truth aligned.
type LotState = 'assigned' | 'unassigned' | 'sold' | 'picked-up' | 'not-sellable';
type AiStatus = 'success' | 'partial' | 'failure' | 'not-run';
type Role = 'admin' | 'office' | 'warehouse';

const STATE_LABEL: Record<LotState, string> = {
  assigned: 'Assigned', unassigned: 'Unassigned', sold: 'Sold',
  'picked-up': 'Picked up', 'not-sellable': 'Not sellable',
};

const STATE_CLS: Record<LotState, string> = {
  assigned: 'bg-state-assigned-bg text-state-assigned',
  unassigned: 'bg-state-unassigned-bg text-state-unassigned',
  sold: 'bg-state-sold-bg text-state-sold',
  'picked-up': 'bg-state-picked-up-bg text-state-picked-up',
  'not-sellable': 'bg-state-not-sellable-bg text-state-not-sellable',
};

const AI_LABEL: Record<AiStatus, string> = {
  success: 'AI', partial: 'AI partial', failure: 'AI failed', 'not-run': '—',
};
const AI_CLS: Record<AiStatus, string> = {
  success: 'text-ai-success', partial: 'text-ai-partial',
  failure: 'text-ai-failure', 'not-run': 'text-ai-not-run',
};

const ROLE_LABEL: Record<Role, string> = { admin: 'Admin', office: 'Office', warehouse: 'Warehouse' };
const ROLE_CLS: Record<Role, string> = {
  admin: 'bg-role-admin-bg text-role-admin',
  office: 'bg-role-office-bg text-role-office',
  warehouse: 'bg-role-warehouse-bg text-role-warehouse',
};

const baseCls = 'inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold tracking-wide uppercase';

export function StatePill({ state, className, ...rest }: { state: LotState } & HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn(baseCls, STATE_CLS[state], className)} {...rest}>{STATE_LABEL[state]}</span>;
}

// Intentionally unstyled (no padding/border) — renders as plain colored text, not a pill shape.
// Used as an inline annotation in the inventory AI-status column per the design handoff.
export function AiStatusPill({ status, className, ...rest }: { status: AiStatus } & HTMLAttributes<HTMLSpanElement>) {
  const defaultAriaLabel = status === 'not-run' ? 'AI not run' : undefined;
  return (
    <span
      aria-label={defaultAriaLabel}
      className={cn('inline-flex items-center text-xs font-semibold', AI_CLS[status], className)}
      {...rest}
    >
      {AI_LABEL[status]}
    </span>
  );
}

export function RolePill({ role, className, ...rest }: { role: Role } & HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn(baseCls, ROLE_CLS[role], className)} {...rest}>{ROLE_LABEL[role]}</span>;
}

// Reprint-needed indicator. Set when compact-lots renumbered a lot;
// cleared when /api/labels/render fires for the lot.
export function ReprintPill({ className, ...rest }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      title="Lot number changed; physical label needs to be reprinted"
      className={cn(baseCls, 'bg-warning-bg text-warning', className)}
      {...rest}
    >
      Reprint
    </span>
  );
}
