import { useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useLots, useLot } from '@/hooks/useLots';
import { useBulkLotAction } from '@/hooks/useBulkLotAction';
import { useRole } from '@/lib/auth';
import { useToast } from '@/components/ui/toast';
import { InventoryFilters, type Filters } from '@/components/inventory/InventoryFilters';
import { InventoryTable } from '@/components/inventory/InventoryTable';
import { BulkActionBar } from '@/components/inventory/BulkActionBar';
import { LotDetail } from '@/components/lot/LotDetail';
import { BulkChangeStateDialog } from '@/components/bulk/BulkChangeStateDialog';
import { BulkMoveDialog } from '@/components/bulk/BulkMoveDialog';
import { BulkDeleteDialog } from '@/components/bulk/BulkDeleteDialog';
import { ExportCsvDialog } from '@/components/bulk/ExportCsvDialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { LotState } from '@shared/types';

const STATES_VALID: LotState[] = ['assigned', 'unassigned', 'sold', 'picked-up', 'not-sellable'];

function parseFiltersFromUrl(params: URLSearchParams): Filters {
  return {
    customerId: params.get('customerId') ?? undefined,
    jobId: params.get('jobId') ?? undefined,
    state: params.getAll('state').filter((s): s is LotState => STATES_VALID.includes(s as LotState)),
  };
}

function writeFiltersToUrl(params: URLSearchParams, f: Filters): URLSearchParams {
  const next = new URLSearchParams(params);
  next.delete('customerId'); next.delete('jobId'); next.delete('state');
  if (f.customerId) next.set('customerId', f.customerId);
  if (f.jobId) next.set('jobId', f.jobId);
  for (const s of f.state) next.append('state', s);
  return next;
}

export function Inventory() {
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => parseFiltersFromUrl(params), [params]);
  const openLotId = params.get('openLot');
  const role = useRole();
  const isAdmin = role === 'admin';
  const { toast } = useToast();

  const lotsQ = useLots(filters);
  const openLotQ = useLot(openLotId ?? undefined);
  const bulk = useBulkLotAction();

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDialog, setBulkDialog] = useState<'change-state' | 'move' | 'delete' | 'export' | null>(null);

  const selectedLots = useMemo(
    () => (lotsQ.data?.lots ?? []).filter((l) => selected.has(l.id)),
    [lotsQ.data, selected]
  );

  const setOpenLot = (id: string | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set('openLot', id); else next.delete('openLot');
    setParams(next, { replace: false });
  };

  const handleFilterChange = (next: Filters) => {
    setParams(writeFiltersToUrl(params, next), { replace: false });
    setSelected(new Set());
  };

  const handleSelect = (id: string, sel: boolean) => {
    setSelected((curr) => {
      const next = new Set(curr);
      if (sel) next.add(id); else next.delete(id);
      return next;
    });
  };

  const handleSelectAll = (sel: boolean) => {
    setSelected(sel ? new Set((lotsQ.data?.lots ?? []).map((l) => l.id)) : new Set());
  };

  const summarizeBulk = (results: { ok: boolean; error?: { message: string } }[]) => {
    const ok = results.filter((r) => r.ok).length;
    const fail = results.length - ok;
    if (fail === 0) toast({ title: `${ok} lots updated`, variant: 'success' });
    else if (ok === 0) toast({ title: 'All updates failed', description: results[0]?.error?.message, variant: 'danger' });
    else toast({ title: `${ok} of ${results.length} lots updated`, description: `${fail} failed.`, variant: 'warning' });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-text">Inventory</h1>
        <div className="text-sm text-textDim">{lotsQ.data ? `${lotsQ.data.total} total` : 'Loading…'}</div>
      </div>

      <InventoryFilters filters={filters} onChange={handleFilterChange} />

      {lotsQ.error && <div className="text-sm text-danger">Failed to load lots: {(lotsQ.error as Error).message}</div>}

      <InventoryTable
        lots={lotsQ.data?.lots ?? []}
        selected={selected}
        onSelect={handleSelect}
        onSelectAll={handleSelectAll}
        onOpen={setOpenLot}
      />

      <BulkActionBar
        count={selected.size}
        isAdmin={isAdmin}
        onClear={() => setSelected(new Set())}
        onMove={() => setBulkDialog('move')}
        onChangeState={() => setBulkDialog('change-state')}
        onDelete={() => setBulkDialog('delete')}
        onExport={() => setBulkDialog('export')}
      />

      <Dialog open={!!openLotId} onOpenChange={(o) => !o && setOpenLot(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle className="sr-only">Lot detail</DialogTitle></DialogHeader>
          {openLotQ.data ? (
            <LotDetail lot={openLotQ.data} onClose={() => setOpenLot(null)} canEdit canDelete={isAdmin} />
          ) : openLotQ.isLoading ? (
            <div className="text-sm text-textDim p-8 text-center">Loading…</div>
          ) : (
            <div className="text-sm text-danger p-4">Lot not found</div>
          )}
        </DialogContent>
      </Dialog>

      <BulkChangeStateDialog
        open={bulkDialog === 'change-state'}
        onClose={() => setBulkDialog(null)}
        lots={selectedLots}
        busy={bulk.isPending}
        onConfirm={async (to) => {
          const r = await bulk.mutateAsync({ action: 'change-state', lotIds: [...selected], params: { to } });
          summarizeBulk(r.results);
          setSelected(new Set(r.results.filter((x) => !x.ok).map((x) => x.id)));
          setBulkDialog(null);
        }}
      />
      <BulkMoveDialog
        open={bulkDialog === 'move'}
        onClose={() => setBulkDialog(null)}
        count={selected.size}
        busy={bulk.isPending}
        onConfirm={async (destinationJobId) => {
          const r = await bulk.mutateAsync({ action: 'move', lotIds: [...selected], params: { destinationJobId } });
          summarizeBulk(r.results);
          setSelected(new Set(r.results.filter((x) => !x.ok).map((x) => x.id)));
          setBulkDialog(null);
        }}
      />
      <BulkDeleteDialog
        open={bulkDialog === 'delete'}
        onClose={() => setBulkDialog(null)}
        count={selected.size}
        busy={bulk.isPending}
        onConfirm={async () => {
          const r = await bulk.mutateAsync({ action: 'delete', lotIds: [...selected] });
          summarizeBulk(r.results);
          setSelected(new Set(r.results.filter((x) => !x.ok).map((x) => x.id)));
          setBulkDialog(null);
        }}
      />
      <ExportCsvDialog
        open={bulkDialog === 'export'}
        onClose={() => setBulkDialog(null)}
        onConfirm={async () => {
          const qs = writeFiltersToUrl(new URLSearchParams(), filters).toString();
          const url = `/api/lots/export${qs ? '?' + qs : ''}`;
          const { data } = await import('@/lib/supabase').then((m) => m.supabase.auth.getSession());
          const token = data.session?.access_token;
          const r = await fetch(url, { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {} });
          if (!r.ok) { toast({ title: 'Export failed', variant: 'danger' }); return; }
          const blob = await r.blob();
          const filename = `lots-${Date.now()}.csv`;
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = filename;
          a.click();
          URL.revokeObjectURL(a.href);
          setBulkDialog(null);
          toast({ title: 'Export ready', description: `Downloaded ${filename}`, variant: 'success' });
        }}
      />
    </div>
  );
}
