// src/components/catalog/CustomerJobPicker.tsx
// /catalog entry — pick a customer and job, then Begin Session.
// Uses native <select> dropdowns so the lists scale to any size.
// Sits inside AdminShell so admins/office have rail nav back to other pages.

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCustomers } from '@/hooks/useCustomers';
import { useJobs } from '@/hooks/useJobs';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

export function CustomerJobPicker() {
  const navigate = useNavigate();
  const customers = useCustomers();
  const [customerId, setCustomerId] = useState<string>('');
  const [jobId, setJobId] = useState<string>('');
  const jobsQ = useJobs(customerId || undefined);

  // Phase 5: hide disabled customers from the picker. Existing in-flight
  // jobs under a disabled customer can still be viewed elsewhere, but no
  // new cataloging session can target them.
  const activeCustomers = (customers.data ?? []).filter((c) => c.disabledAt === null);
  const openJobs = (jobsQ.data ?? []).filter((j) => !j.closedAt);
  const canBegin = !!customerId && !!jobId;

  const begin = () => {
    if (canBegin) navigate(`/catalog/session?customer=${customerId}&job=${jobId}`);
  };

  return (
    <div className="max-w-md space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-text">Start a cataloging session</h1>
        <p className="text-sm text-textDim mt-1">Pick a customer and Job to begin adding lots.</p>
      </div>

      <div className="space-y-1">
        <Label htmlFor="picker-customer">Customer</Label>
        <select
          id="picker-customer"
          value={customerId}
          onChange={(e) => { setCustomerId(e.target.value); setJobId(''); }}
          disabled={customers.isLoading || !!customers.error}
          className="w-full h-10 rounded-md border border-borderStrong bg-surfaceSolid px-3 text-sm"
        >
          <option value="">{customers.isLoading ? 'Loading…' : 'Select a customer'}</option>
          {activeCustomers.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        {customers.error && (
          <p className="text-xs text-danger">Could not load customers: {(customers.error as Error).message}</p>
        )}
      </div>

      {customerId && (
        <div className="space-y-1">
          <Label htmlFor="picker-job">Job</Label>
          {jobsQ.isLoading ? (
            <div className="text-sm text-textDim">Loading jobs…</div>
          ) : openJobs.length === 0 ? (
            <div className="text-sm text-textDim p-3 rounded-md border border-border bg-surfaceAlt">
              No open jobs for this customer. Create or reopen a Job before starting a session.
            </div>
          ) : (
            <select
              id="picker-job"
              value={jobId}
              onChange={(e) => setJobId(e.target.value)}
              className="w-full h-10 rounded-md border border-borderStrong bg-surfaceSolid px-3 text-sm"
            >
              <option value="">Select a Job</option>
              {openJobs.map((j) => (
                <option key={j.id} value={j.id}>{j.jobNumber}</option>
              ))}
            </select>
          )}
        </div>
      )}

      <Button onClick={begin} disabled={!canBegin} className="w-full h-11">
        Begin session
      </Button>
    </div>
  );
}
