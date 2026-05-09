// src/components/inventory/InventoryMobile.tsx
// Single-column compact rows for mobile inventory. Each row: 56×56 photo
// thumbnail (signed URL or placeholder) + customer · job · #N (mono) +
// title (body) + state pill + AI annotation. Tap row → URL ?openLot=...
// (existing Phase 2 modal pattern). No bulk selection on mobile per spec §8.7.
//
// Implementation references option-c-mobile-inventory.jsx → MobileInventoryScreen.

import { Link } from 'react-router-dom';
import { StatePill, AiStatusPill, ReprintPill } from '@/components/ui/pill';
import type { LotDTO } from '@shared/types';

type Props = {
  lots: LotDTO[];
  onOpen: (id: string) => void;
};

export function InventoryMobile({ lots, onOpen }: Props) {
  return (
    <div className="flex flex-col gap-2">
      {lots.length === 0 && (
        <EmptyState />
      )}
      {lots.map((l) => (
        <button
          key={l.id}
          type="button"
          onClick={() => onOpen(l.id)}
          className="flex items-stretch gap-3 p-2.5 bg-surfaceSolid border border-border rounded-md text-left hover:bg-surfaceAlt transition-colors"
        >
          <div className="size-14 shrink-0 rounded overflow-hidden border border-border bg-surfaceAlt">
            {l.coverSignedUrl ? (
              <img src={l.coverSignedUrl} alt="" className="size-full object-cover" />
            ) : (
              <div className="size-full flex items-center justify-center text-[9px] uppercase tracking-wide text-textFaint font-mono">
                #{l.lotNumber ?? '—'}
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
            <div className="text-[11px] text-textDim font-mono tracking-tight truncate">
              {l.customerName ?? '—'} · {l.jobNumber ?? '—'} · #{l.lotNumber ?? '—'}
            </div>
            <div className="text-[13px] font-semibold text-text truncate leading-tight">
              {l.title ?? <span className="italic text-textFaint">Untitled</span>}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <StatePill state={l.state} />
              <AiStatusPill status={l.lastAiRunStatus ?? 'not-run'} className="text-[10px]" />
              {l.labelReprintNeeded && <ReprintPill className="text-[10px]" />}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="text-center text-textFaint py-12 px-5 flex flex-col items-center gap-3">
      <div className="size-14 rounded-full bg-surfaceAlt border border-border flex items-center justify-center text-textDim text-xl">
        —
      </div>
      <div>
        <div className="text-sm font-semibold text-text">No lots match</div>
        <div className="text-xs text-textDim mt-1">Try clearing one or more filters.</div>
      </div>
      <Link to="/inventory" className="text-xs text-brand font-medium underline">
        Clear filters
      </Link>
    </div>
  );
}
