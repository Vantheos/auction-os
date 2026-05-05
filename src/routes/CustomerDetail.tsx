// src/routes/CustomerDetail.tsx
import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { CustomerDTO, JobDTO } from '@shared/types';
import { useJobs, useCreateJob, useToggleJobClosed } from '@/hooks/useJobs';
import { CustomerEditDialog } from '@/components/customers/CustomerEditDialog';
import { JobEditDialog } from '@/components/jobs/JobEditDialog';
import { JobExportButton } from '@/components/jobs/JobExportButton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';

const DEFAULT_START_BID = '5.00';

export function CustomerDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: customer } = useQuery({
    queryKey: ['customer', id],
    enabled: !!id,
    queryFn: () => api<CustomerDTO>(`/customers/${id}`),
  });
  const { data: jobs } = useJobs(id);
  const create = useCreateJob(id!);
  const toggle = useToggleJobClosed(id!);
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [jobNumber, setJobNumber] = useState('');
  const [startBid, setStartBid] = useState(DEFAULT_START_BID);
  const [shippable, setShippable] = useState(false);
  const [jobEditing, setJobEditing] = useState<JobDTO | null>(null);

  const startBidValid = /^\d+(\.\d{1,2})?$/.test(startBid.trim());

  async function onCreate() {
    try {
      await create.mutateAsync({ jobNumber, startBid: startBid.trim(), shippable });
      setJobNumber('');
      setStartBid(DEFAULT_START_BID);
      setShippable(false);
      setOpen(false);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Failed to create job');
    }
  }

  if (!customer) return <p className="text-textDim">Loading…</p>;

  return (
    <div className="space-y-6">
      <div>
        <Link to="/customers" className="text-sm text-textDim hover:underline">← Customers</Link>
        <div className="flex items-baseline gap-3 mt-2">
          <h1 className="text-2xl font-bold">{customer.name}</h1>
          {customer.disabledAt && (
            <span className="text-xs px-2 py-0.5 rounded-pill bg-warning-bg text-warning">Disabled</span>
          )}
          <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>Edit customer</Button>
        </div>
        {customer.sellerCode === null && (
          <p className="text-xs text-warning mt-1">
            Seller Code is not set. Required before exporting jobs for this customer.
          </p>
        )}
        {customer.sellerCode && (
          <p className="text-xs text-textDim mt-1 font-mono">SellerCode: {customer.sellerCode}</p>
        )}
      </div>

      <CustomerEditDialog customer={customer} open={editOpen} onOpenChange={setEditOpen} />

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Jobs</h2>
          {/* Phase 5 Area B: disabled customers can't accept new jobs.
              Existing jobs remain visible/editable so admin can still
              manage in-flight work; only the create surface is gated. */}
          <Dialog open={open && !customer.disabledAt} onOpenChange={(o) => !customer.disabledAt && setOpen(o)}>
            <DialogTrigger asChild>
              <Button
                disabled={!!customer.disabledAt}
                title={customer.disabledAt ? 'Customer is disabled — re-enable to create new jobs' : undefined}
              >
                New job
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>New job for {customer.name}</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label htmlFor="jobNumber">Job number</Label>
                  <Input id="jobNumber" value={jobNumber} onChange={(e) => setJobNumber(e.target.value)} autoFocus placeholder="e.g. 2026-04-Smith-001" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="newJobStartBid">Start Bid</Label>
                  <Input
                    id="newJobStartBid"
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    value={startBid}
                    onChange={(e) => setStartBid(e.target.value)}
                  />
                  <p className="text-xs text-textDim">Default starting bid for every lot in this job (e.g. 5.00).</p>
                  {!startBidValid && <p className="text-xs text-danger">Start Bid must be a positive decimal.</p>}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="newJobShippable">Shippable lots</Label>
                  <div className="flex items-center gap-2">
                    <input
                      id="newJobShippable"
                      type="checkbox"
                      checked={shippable}
                      onChange={(e) => setShippable(e.target.checked)}
                      className="h-4 w-4"
                    />
                    <span className="text-sm">{shippable ? 'Yes' : 'No'}</span>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={onCreate} disabled={!jobNumber.trim() || !startBidValid || create.isPending}>
                  {create.isPending ? 'Creating…' : 'Create'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Job number</TableHead>
              <TableHead>Start Bid</TableHead>
              <TableHead>Shippable</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {jobs?.map((j) => (
              <TableRow key={j.id}>
                <TableCell className="font-mono text-sm">{j.jobNumber}</TableCell>
                <TableCell className="font-mono text-sm">${j.startBid}</TableCell>
                <TableCell className="text-sm">{j.shippable ? 'Yes' : 'No'}</TableCell>
                <TableCell>
                  {j.closedAt
                    ? <span className="text-xs px-2 py-0.5 rounded-pill bg-warning-bg text-warning">Closed</span>
                    : <span className="text-xs px-2 py-0.5 rounded-pill bg-success-bg text-success">Open</span>}
                </TableCell>
                <TableCell className="text-textDim font-mono text-xs">{new Date(j.createdAt).toLocaleDateString()}</TableCell>
                <TableCell>
                  <div className="flex gap-1 flex-wrap">
                    <JobExportButton job={j} customer={customer} />
                    <Button size="sm" variant="ghost" onClick={() => setJobEditing(j)}>Edit</Button>
                    <Button size="sm" variant="ghost" onClick={() => toggle.mutate({ id: j.id, closed: !j.closedAt })}>
                      {j.closedAt ? 'Reopen' : 'Close'}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {jobs?.length === 0 && <TableRow><TableCell colSpan={6} className="text-textDim text-center">No jobs yet</TableCell></TableRow>}
          </TableBody>
        </Table>
      </section>

      {jobEditing && (
        <JobEditDialog
          job={jobEditing}
          customerId={id!}
          open={!!jobEditing}
          onOpenChange={(o) => { if (!o) setJobEditing(null); }}
        />
      )}
    </div>
  );
}
