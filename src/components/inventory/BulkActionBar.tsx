// src/components/inventory/BulkActionBar.tsx
import { Button } from '@/components/ui/button';

type Props = {
  count: number;
  isAdmin: boolean;
  onClear: () => void;
  onMove: () => void;
  onChangeState: () => void;
  onResetAi: () => void;
  onReprint: () => void;
  onDelete: () => void;
};

export function BulkActionBar({ count, isAdmin, onClear, onMove, onChangeState, onResetAi, onReprint, onDelete }: Props) {
  if (count === 0) return null;
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 max-w-3xl w-[calc(100%-2rem)]">
      <div className="rounded-lg border border-border bg-surfaceSolid shadow-lg px-3 py-2 flex items-center gap-2">
        <span className="text-sm font-medium text-text">{count} selected</span>
        <Button size="sm" variant="ghost" onClick={onClear}>Clear</Button>
        <div className="flex-1" />
        <Button size="sm" variant="outline" onClick={onMove}>Assign to Job</Button>
        <Button size="sm" variant="outline" onClick={onChangeState}>Change status</Button>
        <Button size="sm" variant="outline" onClick={onResetAi}>Reset AI</Button>
        <Button size="sm" variant="outline" onClick={onReprint}>Reprint labels</Button>
        {isAdmin && <Button size="sm" variant="destructive" onClick={onDelete}>Delete</Button>}
      </div>
    </div>
  );
}
