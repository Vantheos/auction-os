// src/components/inventory/InventoryFiltersMobileSheet.tsx
// Bottom-drawer filter UX for mobile inventory. Same filter set as the
// desktop sidebar (customer, job, lot status). Apply commits and closes;
// Clear all resets local state and applies the empty filter.
//
// Renders into Radix portal; the parent component owns the open state.

import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetBody, SheetFooter, SheetClose } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { useCustomers } from '@/hooks/useCustomers';
import { useJobs } from '@/hooks/useJobs';
import type { Filters } from './InventoryFilters';
import type { LotState } from '@shared/types';

const STATES: LotState[] = ['assigned', 'unassigned', 'sold', 'picked-up', 'not-sellable'];
const STATE_LABEL: Record<LotState, string> = {
  assigned: 'Assigned', unassigned: 'Unassigned', sold: 'Sold',
  'picked-up': 'Picked up', 'not-sellable': 'Not sellable',
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filters: Filters;
  onApply: (next: Filters) => void;
};

// Outer shell controls the Sheet open state. The body is split into a
// sibling component that only mounts while open, so its useState seeds
// from `filters` fresh on each open without setState-in-effect.
export function InventoryFiltersMobileSheet({ open, onOpenChange, filters, onApply }: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        {open && <SheetBodyInner initial={filters} onApply={onApply} onClose={() => onOpenChange(false)} />}
      </SheetContent>
    </Sheet>
  );
}

function SheetBodyInner({ initial, onApply, onClose }: { initial: Filters; onApply: (next: Filters) => void; onClose: () => void }) {
  const [draft, setDraft] = useState<Filters>(initial);
  const customers = useCustomers();
  const jobs = useJobs(draft.customerId);

  const toggleState = (s: LotState) =>
    setDraft((d) => ({ ...d, state: d.state.includes(s) ? d.state.filter((x) => x !== s) : [...d.state, s] }));

  const apply = () => {
    onApply(draft);
    onClose();
  };

  const clearAll = () => {
    const empty: Filters = { state: [] };
    setDraft(empty);
    onApply(empty);
    onClose();
  };

  return (
    <>
        <SheetHeader>
          <SheetTitle>Filters</SheetTitle>
          <SheetClose className="text-textDim hover:text-text text-lg leading-none">×</SheetClose>
        </SheetHeader>

        <SheetBody>
          <Field label="Customer">
            <select
              value={draft.customerId ?? ''}
              onChange={(e) => setDraft({ ...draft, customerId: e.target.value || undefined, jobId: undefined })}
              className="w-full h-10 px-3 rounded-md border border-borderStrong bg-surfaceSolid text-sm"
            >
              <option value="">All customers</option>
              {customers.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>

          {draft.customerId && (
            <Field label="Job">
              <select
                value={draft.jobId ?? ''}
                onChange={(e) => setDraft({ ...draft, jobId: e.target.value || undefined })}
                className="w-full h-10 px-3 rounded-md border border-borderStrong bg-surfaceSolid text-sm"
              >
                <option value="">All jobs</option>
                {jobs.data?.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.jobNumber}{j.closedAt ? ' (closed)' : ''}
                  </option>
                ))}
              </select>
            </Field>
          )}

          <Field label="Lot status">
            <div className="flex flex-wrap gap-1.5">
              {STATES.map((s) => {
                const active = draft.state.includes(s);
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => toggleState(s)}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${
                      active ? 'bg-info-bg border-brand text-brand' : 'bg-surfaceSolid border-borderStrong text-textDim'
                    }`}
                  >
                    {STATE_LABEL[s]}
                  </button>
                );
              })}
            </div>
          </Field>

          <Field label="AI">
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setDraft({ ...draft, awaitingAi: !draft.awaitingAi })}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${
                  draft.awaitingAi
                    ? 'bg-info-bg border-brand text-brand'
                    : 'bg-surfaceSolid border-borderStrong text-textDim'
                }`}
              >
                Awaiting AI
              </button>
              <button
                type="button"
                onClick={() => setDraft({ ...draft, needsReview: !draft.needsReview })}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${
                  draft.needsReview
                    ? 'bg-warning-bg border-warning text-warning'
                    : 'bg-surfaceSolid border-borderStrong text-textDim'
                }`}
              >
                Needs review
              </button>
            </div>
          </Field>
        </SheetBody>

        <SheetFooter>
          <Button variant="outline" onClick={clearAll} className="flex-1 h-11">Clear all</Button>
          <Button onClick={apply} className="flex-[2] h-11">Apply filters</Button>
        </SheetFooter>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide font-semibold text-textDim mb-2">{label}</div>
      {children}
    </div>
  );
}
