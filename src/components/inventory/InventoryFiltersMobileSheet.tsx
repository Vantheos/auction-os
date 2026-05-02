// src/components/inventory/InventoryFiltersMobileSheet.tsx
// Bottom-drawer filter UX for mobile inventory. Same filter set as the
// desktop sidebar (customer, job, lot status). Apply commits and closes;
// Clear all resets local state and applies the empty filter.
//
// Renders into Radix portal; the parent component owns the open state.

import { useEffect, useState } from 'react';
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

export function InventoryFiltersMobileSheet({ open, onOpenChange, filters, onApply }: Props) {
  const [draft, setDraft] = useState<Filters>(filters);
  const customers = useCustomers();
  const jobs = useJobs(draft.customerId);

  // Reset draft to live filters on open
  useEffect(() => {
    if (open) setDraft(filters);
  }, [open, filters]);

  const toggleState = (s: LotState) =>
    setDraft((d) => ({ ...d, state: d.state.includes(s) ? d.state.filter((x) => x !== s) : [...d.state, s] }));

  const apply = () => {
    onApply(draft);
    onOpenChange(false);
  };

  const clearAll = () => {
    const empty: Filters = { state: [] };
    setDraft(empty);
    onApply(empty);
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
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
        </SheetBody>

        <SheetFooter>
          <Button variant="outline" onClick={clearAll} className="flex-1 h-11">Clear all</Button>
          <Button onClick={apply} className="flex-[2] h-11">Apply filters</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
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
