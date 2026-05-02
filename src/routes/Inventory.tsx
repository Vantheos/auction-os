import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useInfiniteLots, flattenLots } from '@/hooks/useInfiniteLots';
import { useLot } from '@/hooks/useLots';
import { useBulkLotAction } from '@/hooks/useBulkLotAction';
import { useRole } from '@/lib/auth';
import { useToast } from '@/components/ui/toast';
import { InventoryFilters, type Filters } from '@/components/inventory/InventoryFilters';
import { InventoryTable } from '@/components/inventory/InventoryTable';
import { InventoryMobile } from '@/components/inventory/InventoryMobile';
import { InventoryFiltersMobileSheet } from '@/components/inventory/InventoryFiltersMobileSheet';
import { BulkActionBar } from '@/components/inventory/BulkActionBar';
import { LotDetail } from '@/components/lot/LotDetail';
import { BulkChangeStateDialog } from '@/components/bulk/BulkChangeStateDialog';
import { BulkMoveDialog } from '@/components/bulk/BulkMoveDialog';
import { BulkDeleteDialog } from '@/components/bulk/BulkDeleteDialog';
import { ExportCsvDialog } from '@/components/bulk/ExportCsvDialog';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
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

function activeFilterCount(f: Filters): number {
  return (f.customerId ? 1 : 0) + (f.jobId ? 1 : 0) + f.state.length;
}

export function Inventory() {
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => parseFiltersFromUrl(params), [params]);
  const openLotId = params.get('openLot');
  const role = useRole();
  const isAdmin = role === 'admin';
  const { toast } = useToast();

  const lotsQ = useInfiniteLots(filters);
  const { lots, total } = useMemo(() => flattenLots(lotsQ.data?.pages), [lotsQ.data]);
  const openLotQ = useLot(openLotId ?? undefined);
  const bulk = useBulkLotAction();

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDialog, setBulkDialog] = useState<'change-state' | 'move' | 'delete' | 'export' | null>(null);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [lotEditDirty, setLotEditDirty] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  // No explicit reset on close — LotEditForm fires onDirtyChange(false) on
  // mount of a freshly-opened lot, which clears any stale flag from a prior
  // session. Until then, lotEditDirty is only consulted by guardedCloseLot,
  // which is exactly when we want the flag to be accurate.

  // IntersectionObserver-driven infinite scroll. Sentinel at the bottom of
  // the list triggers fetchNextPage when it enters the viewport.
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && lotsQ.hasNextPage && !lotsQ.isFetchingNextPage) {
        void lotsQ.fetchNextPage();
      }
    }, { threshold: 0.1 });
    io.observe(el);
    return () => io.disconnect();
  }, [lotsQ]);

  const selectedLots = useMemo(
    () => lots.filter((l) => selected.has(l.id)),
    [lots, selected]
  );

  const setOpenLot = useCallback((id: string | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set('openLot', id); else next.delete('openLot');
    setParams(next, { replace: false });
  }, [params, setParams]);

  // Guard close attempts: if the LotEditForm has unsaved changes, show a
  // confirm dialog instead of dropping straight to setOpenLot(null). All
  // close paths (Dialog X, Escape, outside click, LotDetail's Close button)
  // funnel through this.
  const guardedCloseLot = useCallback(() => {
    if (lotEditDirty) {
      setConfirmDiscard(true);
    } else {
      setOpenLot(null);
    }
  }, [lotEditDirty, setOpenLot]);

  const discardAndCloseLot = () => {
    setLotEditDirty(false);
    setConfirmDiscard(false);
    setOpenLot(null);
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
    setSelected(sel ? new Set(lots.map((l) => l.id)) : new Set());
  };

  const summarizeBulk = (results: { ok: boolean; error?: { message: string } }[]) => {
    const ok = results.filter((r) => r.ok).length;
    const fail = results.length - ok;
    if (fail === 0) toast({ title: `${ok} lots updated`, variant: 'success' });
    else if (ok === 0) toast({ title: 'All updates failed', description: results[0]?.error?.message, variant: 'danger' });
    else toast({ title: `${ok} of ${results.length} lots updated`, description: `${fail} failed.`, variant: 'warning' });
  };

  const filterCount = activeFilterCount(filters);

  return (
    <div className="space-y-4">
      {/* Header — same on both viewports */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-text">Inventory</h1>
        <div className="text-sm text-textDim">
          {lotsQ.isLoading ? 'Loading…' : `${total} total`}
        </div>
      </div>

      {/* Filters — desktop sidebar at md+, mobile filter button below */}
      <div className="hidden md:block">
        <InventoryFilters filters={filters} onChange={handleFilterChange} />
      </div>
      <div className="md:hidden flex items-center gap-2">
        <Button
          variant={filterCount > 0 ? 'secondary' : 'outline'}
          onClick={() => setFilterSheetOpen(true)}
          className="flex-shrink-0"
        >
          Filter{filterCount > 0 ? <span className="ml-1.5 inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-brand text-white text-[10px] font-bold">{filterCount}</span> : null}
        </Button>
        {filterCount > 0 && (
          <Button variant="ghost" size="sm" onClick={() => handleFilterChange({ state: [] })}>
            Clear
          </Button>
        )}
      </div>

      {lotsQ.error && (
        <div className="text-sm text-danger">Failed to load lots: {(lotsQ.error as Error).message}</div>
      )}

      {/* Lot list — table at md+, single-column rows below */}
      <div className="hidden md:block">
        <InventoryTable
          lots={lots}
          selected={selected}
          onSelect={handleSelect}
          onSelectAll={handleSelectAll}
          onOpen={setOpenLot}
        />
      </div>
      <div className="md:hidden">
        <InventoryMobile lots={lots} onOpen={setOpenLot} />
      </div>

      {/* Infinite-scroll sentinel + status */}
      <div ref={sentinelRef} className="h-8 flex items-center justify-center text-xs text-textFaint">
        {lotsQ.isFetchingNextPage ? 'Loading more…' :
         lotsQ.hasNextPage ? '' :
         lots.length > 0 ? 'End of results' : ''}
      </div>

      {/* Bulk action bar — desktop only per spec §8.7 */}
      <div className="hidden md:block">
        <BulkActionBar
          count={selected.size}
          isAdmin={isAdmin}
          onClear={() => setSelected(new Set())}
          onMove={() => setBulkDialog('move')}
          onChangeState={() => setBulkDialog('change-state')}
          onDelete={() => setBulkDialog('delete')}
          onExport={() => setBulkDialog('export')}
        />
      </div>

      {/* Mobile filter sheet (parent-owned open state; portaled) */}
      <InventoryFiltersMobileSheet
        open={filterSheetOpen}
        onOpenChange={setFilterSheetOpen}
        filters={filters}
        onApply={handleFilterChange}
      />

      {/* Lot detail modal — full-screen on mobile per spec §5.3.
          All close paths funnel through guardedCloseLot so unsaved edits
          surface a confirm dialog before discarding. */}
      <Dialog open={!!openLotId} onOpenChange={(o) => { if (!o) guardedCloseLot(); }}>
        <DialogContent className="max-w-2xl" fullScreenOnMobile>
          <DialogHeader><DialogTitle className="sr-only">Lot detail</DialogTitle></DialogHeader>
          {openLotQ.data ? (
            <LotDetail
              lot={openLotQ.data}
              onClose={guardedCloseLot}
              canEdit
              canDelete={isAdmin}
              onDirtyChange={setLotEditDirty}
            />
          ) : openLotQ.isLoading ? (
            <div className="text-sm text-textDim p-8 text-center">Loading…</div>
          ) : (
            <div className="text-sm text-danger p-4">Lot not found</div>
          )}
        </DialogContent>
      </Dialog>

      {/* Unsaved-changes confirm — fires only when guardedCloseLot sees
          lotEditDirty=true. Two paths: keep editing (cancel close), or
          discard changes (close + drop edits). */}
      <Dialog open={confirmDiscard} onOpenChange={(o) => !o && setConfirmDiscard(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Discard unsaved changes?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-textDim">
            This lot has unsaved changes. Closing now will lose them.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDiscard(false)}>Keep editing</Button>
            <Button variant="destructive" onClick={discardAndCloseLot}>Discard changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <BulkChangeStateDialog
        open={bulkDialog === 'change-state'}
        onClose={() => setBulkDialog(null)}
        lots={selectedLots}
        busy={bulk.isPending}
        onConfirm={async (to) => {
          try {
            const r = await bulk.mutateAsync({ action: 'change-state', lotIds: [...selected], params: { to } });
            summarizeBulk(r.results);
            setSelected(new Set(r.results.filter((x) => !x.ok).map((x) => x.id)));
            setBulkDialog(null);
          } catch (err) {
            toast({
              title: 'Bulk change-status failed',
              description: err instanceof Error ? err.message : 'Unknown error',
              variant: 'danger',
            });
          }
        }}
      />
      <BulkMoveDialog
        open={bulkDialog === 'move'}
        onClose={() => setBulkDialog(null)}
        count={selected.size}
        busy={bulk.isPending}
        onConfirm={async (destinationJobId) => {
          try {
            const r = await bulk.mutateAsync({ action: 'move', lotIds: [...selected], params: { destinationJobId } });
            summarizeBulk(r.results);
            setSelected(new Set(r.results.filter((x) => !x.ok).map((x) => x.id)));
            setBulkDialog(null);
          } catch (err) {
            toast({
              title: 'Bulk assign failed',
              description: err instanceof Error ? err.message : 'Unknown error',
              variant: 'danger',
            });
          }
        }}
      />
      <BulkDeleteDialog
        open={bulkDialog === 'delete'}
        onClose={() => setBulkDialog(null)}
        count={selected.size}
        busy={bulk.isPending}
        onConfirm={async () => {
          try {
            const r = await bulk.mutateAsync({ action: 'delete', lotIds: [...selected] });
            summarizeBulk(r.results);
            setSelected(new Set(r.results.filter((x) => !x.ok).map((x) => x.id)));
            setBulkDialog(null);
          } catch (err) {
            toast({
              title: 'Bulk delete failed',
              description: err instanceof Error ? err.message : 'Unknown error',
              variant: 'danger',
            });
          }
        }}
      />
      <ExportCsvDialog
        open={bulkDialog === 'export'}
        onClose={() => setBulkDialog(null)}
        onConfirm={async () => {
          try {
            const qs = writeFiltersToUrl(new URLSearchParams(), filters).toString();
            const url = `/api/lots/export${qs ? '?' + qs : ''}`;
            const { data } = await supabase.auth.getSession();
            const token = data.session?.access_token;
            if (!token) { toast({ title: 'Export failed', description: 'Not signed in', variant: 'danger' }); return; }
            const r = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
            if (!r.ok) { toast({ title: 'Export failed', description: `Server returned ${r.status}`, variant: 'danger' }); return; }
            const blob = await r.blob();
            const filename = `lots-${Date.now()}.csv`;
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(a.href);
            setBulkDialog(null);
            toast({ title: 'Export ready', description: `Downloaded ${filename}`, variant: 'success' });
          } catch (err) {
            console.error('Export error:', err);
            toast({ title: 'Export failed', description: err instanceof Error ? err.message : 'Unknown error', variant: 'danger' });
          }
        }}
      />
    </div>
  );
}
