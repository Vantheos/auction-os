// src/components/ui/pill.tsx
import { cn } from '@/lib/utils';
import type { HTMLAttributes } from 'react';

type LotState = 'assigned' | 'unassigned' | 'sold' | 'picked-up' | 'not-sellable' | 'in-progress';
type AiStatus = 'success' | 'partial' | 'failure' | 'not-run';
type Role = 'admin' | 'office' | 'warehouse';

const STATE_LABEL: Record<LotState, string> = {
  assigned: 'Assigned', unassigned: 'Unassigned', sold: 'Sold',
  'picked-up': 'Picked up', 'not-sellable': 'Not sellable', 'in-progress': 'In progress',
};

const STATE_CLS: Record<LotState, string> = {
  assigned: 'bg-state-assigned-bg text-state-assigned',
  unassigned: 'bg-state-unassigned-bg text-state-unassigned',
  sold: 'bg-state-sold-bg text-state-sold',
  'picked-up': 'bg-state-picked-up-bg text-state-picked-up',
  'not-sellable': 'bg-state-not-sellable-bg text-state-not-sellable',
  'in-progress': 'bg-state-in-progress-bg text-state-in-progress',
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

export function AiStatusPill({ status, className, ...rest }: { status: AiStatus } & HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn('inline-flex items-center text-xs font-semibold', AI_CLS[status], className)} {...rest}>{AI_LABEL[status]}</span>;
}

export function RolePill({ role, className, ...rest }: { role: Role } & HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn(baseCls, ROLE_CLS[role], className)} {...rest}>{ROLE_LABEL[role]}</span>;
}
