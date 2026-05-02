// src/components/catalog/CustomerJobPicker.tsx
// Two-step picker: customer list → jobs for the chosen customer. Closed
// jobs visible-but-disabled (D-005). Begin Session enabled only when
// both selected. On Begin: navigate to /catalog/session?customer=&job=
//
// Per option-c-flow.jsx → PickerScreen mockup. Adapted to the shipped
// Mica Slate palette via Tailwind classes.

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCustomers } from '@/hooks/useCustomers';
import { useJobs } from '@/hooks/useJobs';
import { Button } from '@/components/ui/button';

export function CustomerJobPicker() {
  const navigate = useNavigate();
  const customers = useCustomers();
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [custQuery, setCustQuery] = useState('');
  const [jobQuery, setJobQuery] = useState('');
  const jobsQ = useJobs(customerId ?? undefined);

  const filteredCustomers = useMemo(() => {
    const list = customers.data ?? [];
    const q = custQuery.toLowerCase();
    return q ? list.filter((c) => c.name.toLowerCase().includes(q)) : list;
  }, [customers.data, custQuery]);

  const filteredJobs = useMemo(() => {
    const list = jobsQ.data ?? [];
    const q = jobQuery.toLowerCase();
    return q ? list.filter((j) => j.jobNumber.toLowerCase().includes(q)) : list;
  }, [jobsQ.data, jobQuery]);

  const canBegin = !!customerId && !!jobId;

  const begin = () => {
    if (canBegin) {
      navigate(`/catalog/session?customer=${customerId}&job=${jobId}`);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-wash">
      <div className="px-4 py-5 bg-gradient-to-b from-info-bg to-transparent border-b border-border">
        <div className="text-xs uppercase tracking-wide text-textDim font-semibold">Start a session</div>
        <div className="text-2xl font-bold text-text mt-1">Customer · Job</div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        <Section num={1} label="Customer" complete={!!customerId}>
          <SearchField value={custQuery} onChange={setCustQuery} placeholder="Search customers" />
          <div className="mt-2 flex flex-col gap-1">
            {customers.isLoading && <Hint label="Loading…" />}
            {customers.error && <Hint label={`Error: ${(customers.error as Error).message}`} />}
            {filteredCustomers.length === 0 && !customers.isLoading && <Hint label="No customers match" />}
            {filteredCustomers.map((c) => (
              <PickRow
                key={c.id}
                active={c.id === customerId}
                onClick={() => { setCustomerId(c.id); setJobId(null); }}
              >
                <div className="text-sm font-semibold text-text">{c.name}</div>
              </PickRow>
            ))}
          </div>
        </Section>

        {customerId && (
          <Section num={2} label="Job" complete={!!jobId}>
            <SearchField value={jobQuery} onChange={setJobQuery} placeholder="Search jobs" />
            <div className="mt-2 flex flex-col gap-1">
              {jobsQ.isLoading && <Hint label="Loading…" />}
              {filteredJobs.length === 0 && !jobsQ.isLoading && <Hint label="No jobs match" />}
              {filteredJobs.map((j) => {
                const isClosed = !!j.closedAt;
                return (
                  <PickRow
                    key={j.id}
                    active={j.id === jobId}
                    disabled={isClosed}
                    onClick={() => !isClosed && setJobId(j.id)}
                  >
                    <div className="font-mono text-sm font-semibold text-text tracking-tight">{j.jobNumber}</div>
                    {isClosed && (
                      <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-muted text-textDim font-semibold">
                        Closed
                      </span>
                    )}
                  </PickRow>
                );
              })}
            </div>
          </Section>
        )}
      </div>

      <div className="p-4 border-t border-border bg-surfaceSolid">
        <Button onClick={begin} disabled={!canBegin} className="w-full h-12 text-base">
          Begin session
        </Button>
      </div>
    </div>
  );
}

function Section({ num, label, complete, children }: { num: number; label: string; complete: boolean; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className={`size-5 rounded-full text-white text-[10px] font-bold flex items-center justify-center ${complete ? 'bg-state-sold' : 'bg-brand'}`}>
          {complete ? '✓' : num}
        </span>
        <span className="text-xs uppercase tracking-wide text-textDim font-semibold">{label}</span>
      </div>
      {children}
    </div>
  );
}

function SearchField({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <input
      type="search"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full h-10 px-3 rounded-md border border-borderStrong bg-surfaceSolid text-sm text-text outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
    />
  );
}

function PickRow({ active, disabled, onClick, children }: { active: boolean; disabled?: boolean; onClick?: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={!disabled ? onClick : undefined}
      disabled={disabled}
      aria-pressed={active}
      className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-left transition-colors ${
        disabled ? 'opacity-50 cursor-not-allowed bg-surfaceSolid border border-border' :
        active ? 'bg-info-bg border border-brand' : 'bg-surfaceSolid border border-border hover:bg-surfaceAlt'
      }`}
    >
      <span className={`size-4 rounded-full border-2 flex-shrink-0 ${active ? 'border-brand bg-brand ring-2 ring-surfaceSolid ring-inset' : 'border-borderStrong bg-transparent'}`} />
      <div className="flex-1 min-w-0 flex items-center gap-2">{children}</div>
    </button>
  );
}

function Hint({ label }: { label: string }) {
  return (
    <div className="text-center text-xs text-textFaint border border-dashed border-border rounded-md py-3 px-4">
      {label}
    </div>
  );
}
