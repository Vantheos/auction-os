// src/components/inventory/InventoryFilters.tsx
import type { ReactNode } from 'react';
import { useCustomers } from '@/hooks/useCustomers';
import { useJobs } from '@/hooks/useJobs';
import { Button } from '@/components/ui/button';
import type { LotState } from '@shared/types';

const STATES: LotState[] = ['assigned', 'unassigned', 'sold', 'picked-up', 'not-sellable'];

export type Filters = {
  customerId?: string;
  jobId?: string;
  state: LotState[];
  // REQ-1 (2026-05-06): split the old needsInfo filter into two independent
  // chips so operators can target precise queues.
  // - awaitingAi: lastAiRunStatus IS NULL AND state in (assigned, unassigned).
  //   "AI hasn't touched this lot yet."
  // - needsReview: lastAiRunStatus in (partial, failure) OR a required
  //   user-facing field is empty. "AI ran but the lot still isn't ready."
  // Both active = union (everything needing attention).
  awaitingAi?: boolean;
  needsReview?: boolean;
};

type Props = {
  filters: Filters;
  onChange: (next: Filters) => void;
  // Optional right-aligned slot — Phase 5 puts the Export to AF360 button
  // here when a specific Job is filtered. Anything else can sit here too.
  actions?: ReactNode;
};

export function InventoryFilters({ filters, onChange, actions }: Props) {
  const customers = useCustomers();
  const jobs = useJobs(filters.customerId);
  const toggle = (s: LotState) =>
    onChange({ ...filters, state: filters.state.includes(s) ? filters.state.filter((x) => x !== s) : [...filters.state, s] });

  const hasAny = filters.customerId || filters.jobId || filters.state.length > 0 || filters.awaitingAi || filters.needsReview;
  const clear = () => onChange({ state: [] });

  return (
    <div className="flex flex-wrap items-center gap-2 p-3 rounded-lg border border-border bg-surface">
      <select value={filters.customerId ?? ''}
        onChange={(e) => onChange({ ...filters, customerId: e.target.value || undefined, jobId: undefined })}
        className="h-8 rounded-md border border-borderStrong bg-surfaceSolid px-2 text-sm">
        <option value="">All customers</option>
        {customers.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>

      {filters.customerId && (
        <select value={filters.jobId ?? ''}
          onChange={(e) => onChange({ ...filters, jobId: e.target.value || undefined })}
          className="h-8 rounded-md border border-borderStrong bg-surfaceSolid px-2 text-sm">
          <option value="">All jobs</option>
          {jobs.data?.filter((j) => !j.closedAt).map((j) => <option key={j.id} value={j.id}>{j.jobNumber}</option>)}
        </select>
      )}

      <div className="flex items-center gap-1 ml-2">
        <span className="text-xs text-textDim mr-1">State:</span>
        {STATES.map((s) => {
          const active = filters.state.includes(s);
          return (
            <button key={s} type="button" onClick={() => toggle(s)}
              className={`text-xs px-2 py-1 rounded-md border ${
                active ? 'bg-info-bg border-brand text-brand' : 'border-border text-textDim hover:bg-muted'
              }`}>{s}</button>
          );
        })}
      </div>

      <button type="button"
        onClick={() => onChange({ ...filters, awaitingAi: !filters.awaitingAi })}
        className={`text-xs px-2 py-1 rounded-md border ml-2 ${
          filters.awaitingAi ? 'bg-info-bg border-brand text-brand' : 'border-border text-textDim hover:bg-muted'
        }`}>Awaiting AI</button>

      <button type="button"
        onClick={() => onChange({ ...filters, needsReview: !filters.needsReview })}
        className={`text-xs px-2 py-1 rounded-md border ${
          filters.needsReview ? 'bg-warning-bg border-warning text-warning' : 'border-border text-textDim hover:bg-muted'
        }`}>Needs review</button>

      {hasAny && <Button size="sm" variant="ghost" onClick={clear}>Clear filters</Button>}

      {actions && <div className="ml-auto">{actions}</div>}
    </div>
  );
}
