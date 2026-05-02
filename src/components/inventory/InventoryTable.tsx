// src/components/inventory/InventoryTable.tsx
import { Link } from 'react-router-dom';
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
};

export function InventoryTable({ lots, selected, onSelect, onSelectAll, onOpen }: Props) {
  const allOnPageSelected = lots.length > 0 && lots.every((l) => selected.has(l.id));
  const someSelected = selected.size > 0;

  const handleRowClick = (id: string) => {
    if (someSelected) onSelect(id, !selected.has(id));
    else onOpen(id);
  };

  return (
    <div className="rounded-lg border border-border bg-surface overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">
              <Checkbox checked={allOnPageSelected} onCheckedChange={(c) => onSelectAll(!!c)} aria-label="Select all on page" />
            </TableHead>
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
              <TableCell colSpan={6} className="text-center text-textDim py-8">No lots match the current filters</TableCell>
            </TableRow>
          )}
          {lots.map((l) => (
            <TableRow key={l.id} className={`cursor-pointer ${selected.has(l.id) ? 'bg-info-bg/50' : 'hover:bg-muted/50'}`}
              onClick={(e) => {
                if ((e.target as HTMLElement).closest('[data-stop-row-click]')) return;
                handleRowClick(l.id);
              }}>
              <TableCell data-stop-row-click>
                <Checkbox checked={selected.has(l.id)} onCheckedChange={(c) => onSelect(l.id, !!c)} aria-label={`Select lot ${l.lotNumber}`} />
              </TableCell>
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
                <Link to={`/inventory?openLot=${l.id}`} data-stop-row-click className="hover:text-brand">
                  {l.title ?? <span className="text-textFaint italic">Untitled</span>}
                </Link>
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
