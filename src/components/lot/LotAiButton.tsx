// src/components/lot/LotAiButton.tsx
// Lot detail "Run AI" button + in-flight banner. Admin/office only.
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { useAiRun } from '@/hooks/useAiRun';
import { useRole } from '@/lib/auth';
import { useNow } from '@/hooks/useNow';
import type { LotDTO } from '@shared/types';

type Props = { lot: LotDTO };

const FIVE_MIN_MS = 5 * 60 * 1000;

export function LotAiButton({ lot }: Props) {
  const role = useRole();
  const aiRun = useAiRun();
  const qc = useQueryClient();

  // Time-derived state via useSyncExternalStore (encapsulated in useNow).
  // While a lock is active, `now` ticks every 5s and the staleness check
  // stays pure during render.
  const now = useNow(5000, lot.aiProcessingStartedAt !== null);

  const isProcessing = lot.aiProcessingStartedAt !== null
    && now - new Date(lot.aiProcessingStartedAt).getTime() < FIVE_MIN_MS;

  // Auto-refetch the lot query every 5s while the banner is shown so
  // upstream data (lock cleared by AI commit, status updated) flows in.
  useEffect(() => {
    if (!isProcessing) return;
    const id = setInterval(() => {
      qc.invalidateQueries({ queryKey: ['lot', lot.id] });
    }, 5000);
    return () => clearInterval(id);
  }, [isProcessing, qc, lot.id]);

  // Hide for warehouse
  if (role !== 'admin' && role !== 'office') return null;

  if (isProcessing) {
    return (
      <div className="rounded-md border border-info bg-info-bg text-info px-3 py-2 text-sm">
        AI is generating content for this lot. Inputs are read-only until done.
      </div>
    );
  }

  // Hide for ineligible lots: already-run OR wrong state
  if (lot.lastAiRunStatus !== null) return null;
  if (lot.state !== 'assigned' && lot.state !== 'unassigned') return null;

  return (
    <Button
      onClick={() => aiRun.mutate({ lotId: lot.id })}
      disabled={aiRun.isPending}
      variant="default"
    >
      {aiRun.isPending ? 'Running AI…' : 'Run AI'}
    </Button>
  );
}
