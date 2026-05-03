// src/routes/Customers.tsx
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { useCustomers, useCreateCustomer } from '@/hooks/useCustomers';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';

export function Customers() {
  const navigate = useNavigate();
  const { data, isLoading, error } = useCustomers();
  const create = useCreateCustomer();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [search, setSearch] = useState('');

  async function onCreate() {
    await create.mutateAsync({ name });
    setName('');
    setOpen(false);
  }

  // Client-side filter — substring match on customer name, case-insensitive.
  // The full list query stays cached; filtering is just a memoized derive.
  const filtered = useMemo(() => {
    if (!data) return undefined;
    const q = search.trim().toLowerCase();
    if (!q) return data;
    return data.filter((c) => c.name.toLowerCase().includes(q));
  }, [data, search]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Customers</h1>
        <p className="text-sm text-textDim mt-1">Click a customer row to view and manage their jobs.</p>
      </div>

      <div className="flex items-center gap-3">
        <Input
          type="search"
          placeholder="Search customers…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <div className="flex-1" />
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
      {filtered && (
        <Table>
          <TableHeader>
            <TableRow><TableHead>Name</TableHead><TableHead>Created</TableHead><TableHead /></TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((c) => (
              <TableRow
                key={c.id}
                onClick={() => navigate(`/customers/${c.id}`)}
                className="cursor-pointer hover:bg-surfaceAlt"
              >
                <TableCell className="font-medium">{c.name}</TableCell>
                <TableCell className="text-textDim font-mono text-xs">{new Date(c.createdAt).toLocaleString()}</TableCell>
                <TableCell className="w-8 text-right text-textDim">
                  <ChevronRight size={16} aria-hidden="true" />
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="text-textDim text-center">
                  {search.trim()
                    ? `No customers match '${search.trim()}'`
                    : 'No customers yet'}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
