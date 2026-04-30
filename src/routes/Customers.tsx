// src/routes/Customers.tsx
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useCustomers, useCreateCustomer } from '@/hooks/useCustomers';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';

export function Customers() {
  const { data, isLoading, error } = useCustomers();
  const create = useCreateCustomer();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');

  async function onCreate() {
    await create.mutateAsync({ name });
    setName('');
    setOpen(false);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Customers</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button>New customer</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New customer</DialogTitle></DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={onCreate} disabled={!name.trim() || create.isPending}>
                {create.isPending ? 'Creating…' : 'Create'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {error && <p className="text-sm text-danger">Error loading: {(error as Error).message}</p>}
      {isLoading && <p className="text-sm text-textDim">Loading…</p>}
      {data && (
        <Table>
          <TableHeader>
            <TableRow><TableHead>Name</TableHead><TableHead>Created</TableHead><TableHead /></TableRow>
          </TableHeader>
          <TableBody>
            {data.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">{c.name}</TableCell>
                <TableCell className="text-textDim font-mono text-xs">{new Date(c.createdAt).toLocaleString()}</TableCell>
                <TableCell><Link to={`/customers/${c.id}`} className="text-accent hover:underline text-sm">View jobs →</Link></TableCell>
              </TableRow>
            ))}
            {data.length === 0 && <TableRow><TableCell colSpan={3} className="text-textDim text-center">No customers yet</TableCell></TableRow>}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
