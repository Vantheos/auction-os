// src/components/inventory/InventoryTable.tsx
import { Checkbox } from '@/components/ui/checkbox';
import { StatePill, AiStatusPill } from '@/components/ui/pill';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { LotDTO } from '@shared/types';

type Props = {
  lots: LotDTO[];
  selected: Set<string>;
  onSelect: (id: string, selected: boolean) => void;
  onSelectAll: (selected: boolean) => void;
  onOpen: (id: string) => void;
  // When false, the selection column (header + per-row checkboxes) is hidden
  // entirely — used to gate bulk affordances off for warehouse, which has no
  // bulk operations available server-side.
  canSelect?: boolean;
};

export function InventoryTable({ lots, selected, onSelect, onSelectAll, onOpen, canSelect = true }: Props) {
  const allOnPageSelected = lots.length > 0 && lots.every((l) => selected.has(l.id));
  const someSelected = selected.size > 0;

  const handleRowClick = (id: string) => {
    if (canSelect && someSelected) onSelect(id, !selected.has(id));
    else onOpen(id);
  };

  return (
    <div className="rounded-lg border border-border bg-surface overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            {canSelect && (
              <TableHead className="w-10">
                <Checkbox checked={allOnPageSelected} onCheckedChange={(c) => onSelectAll(!!c)} aria-label="Select all on page" />
              </TableHead>
            )}
            <TableHead className="w-14">Photo</TableHead>
            <TableHead>Lot</TableHead>
            <TableHead>Title</TableHead>
            <TableHead>State</TableHead>
            <TableHead>AI</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lots.length === 0 && (
            <TableRow>
              <TableCell colSpan={canSelect ? 6 : 5} className="text-center text-textDim py-8">No lots match the current filters</TableCell>
            </TableRow>
          )}
          {lots.map((l) => (
            <TableRow key={l.id} className={`cursor-pointer ${selected.has(l.id) ? 'bg-info-bg/50' : 'hover:bg-muted/50'}`}
              onClick={(e) => {
                if ((e.target as HTMLElement).closest('[data-stop-row-click]')) return;
                handleRowClick(l.id);
              }}>
              {canSelect && (
                <TableCell data-stop-row-click>
                  <Checkbox checked={selected.has(l.id)} onCheckedChange={(c) => onSelect(l.id, !!c)} aria-label={`Select lot ${l.lotNumber}`} />
                </TableCell>
              )}
              <TableCell>
                <div className="size-10 rounded bg-surfaceAlt border border-border overflow-hidden">
                  {l.coverSignedUrl ? (
                    <img src={l.coverSignedUrl} alt="" className="size-full object-cover" />
                  ) : null}
                </div>
              </TableCell>
              <TableCell>
                <div className="text-sm font-medium text-text">{l.customerName ?? '—'}</div>
                <div className="text-xs text-textDim font-mono">{l.jobNumber ?? '—'} · #{l.lotNumber ?? '—'}</div>
              </TableCell>
              <TableCell className="font-medium text-text">
                {/*
                 * Button instead of <Link>: the link form hardcoded
                 * `/inventory?openLot=...` and wiped any active filter
                 * params (customerId, jobId, awaitingAi, etc.). The
                 * button routes through the parent's onOpen → setOpenLot
                 * which preserves the existing URLSearchParams.
                 */}
                <button
                  type="button"
                  data-stop-row-click
                  onClick={() => onOpen(l.id)}
                  className="text-left hover:text-brand"
                >
                  {l.title ?? <span className="text-textFaint italic">Untitled</span>}
                </button>
              </TableCell>
              <TableCell><StatePill state={l.state} /></TableCell>
              <TableCell><AiStatusPill status={l.lastAiRunStatus ?? 'not-run'} /></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
