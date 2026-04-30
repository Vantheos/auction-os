// src/routes/CustomerDetail.tsx
import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { CustomerDTO } from '@shared/types';
import { useJobs, useCreateJob, useToggleJobClosed } from '@/hooks/useJobs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';

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
  const [jobNumber, setJobNumber] = useState('');

  async function onCreate() {
    try {
      await create.mutateAsync({ jobNumber });
      setJobNumber('');
      setOpen(false);
    } catch (e: any) {
      alert(e.message);
    }
  }

  if (!customer) return <p className="text-textDim">Loading…</p>;

  return (
    <div className="space-y-6">
      <div>
        <Link to="/customers" className="text-sm text-textDim hover:underline">← Customers</Link>
        <h1 className="text-2xl font-bold mt-2">{customer.name}</h1>
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Jobs</h2>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button>New job</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>New job for {customer.name}</DialogTitle></DialogHeader>
              <div className="space-y-2">
                <Label htmlFor="jobNumber">Job number</Label>
                <Input id="jobNumber" value={jobNumber} onChange={(e) => setJobNumber(e.target.value)} autoFocus placeholder="e.g. 2026-04-Smith-001" />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={onCreate} disabled={!jobNumber.trim() || create.isPending}>
                  {create.isPending ? 'Creating…' : 'Create'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <Table>
          <TableHeader>
            <TableRow><TableHead>Job number</TableHead><TableHead>Status</TableHead><TableHead>Created</TableHead><TableHead /></TableRow>
          </TableHeader>
          <TableBody>
            {jobs?.map((j) => (
              <TableRow key={j.id}>
                <TableCell className="font-mono text-sm">{j.jobNumber}</TableCell>
                <TableCell>
                  {j.closedAt
                    ? <span className="text-xs px-2 py-0.5 rounded-pill bg-warning-bg text-warning">Closed</span>
                    : <span className="text-xs px-2 py-0.5 rounded-pill bg-success-bg text-success">Open</span>}
                </TableCell>
                <TableCell className="text-textDim font-mono text-xs">{new Date(j.createdAt).toLocaleDateString()}</TableCell>
                <TableCell>
                  <Button size="sm" variant="ghost" onClick={() => toggle.mutate({ id: j.id, closed: !j.closedAt })}>
                    {j.closedAt ? 'Reopen' : 'Close'}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {jobs?.length === 0 && <TableRow><TableCell colSpan={4} className="text-textDim text-center">No jobs yet</TableCell></TableRow>}
          </TableBody>
        </Table>
      </section>
    </div>
  );
}
