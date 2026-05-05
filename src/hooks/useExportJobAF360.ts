// src/hooks/useExportJobAF360.ts
//
// Phase 5 Area 6 — sequential orchestration of the AF360 export flow.
//
// Flow:
//   1. POST /start → receive { csv, csvFilename, batches, exportLabel, ... }
//   2. Trigger native CSV download via synthetic anchor click
//   3. For each batch in `batches` (sequential):
//        a. POST /batch with { batchNum, lotIds, exportLabel, totalBatches }
//        b. Trigger native zip download from the returned signed URL
//   4. Done — success toast
//
// On error inside the loop, halt and expose `retryFromBatch(N)` so the user
// can re-run from the failing batch without rebuilding earlier ones.

import { useCallback, useRef, useState } from 'react';
import { api } from '@/lib/api';
import type {
  ExportStartResponse,
  ExportBatchPlanItem,
  ExportBatchResponse,
} from '@shared/types';

export type ExportPhase =
  | { kind: 'idle' }
  | { kind: 'starting' }
  | { kind: 'batch'; batchNum: number; totalBatches: number; sub: 'building' | 'downloading' }
  | { kind: 'done'; totalBatches: number; totalLots: number; totalPhotos: number }
  | { kind: 'error'; message: string; failedBatchNum: number | null };

export type UseExportJobAF360 = {
  phase: ExportPhase;
  start: (jobId: string) => Promise<void>;
  retryFromBatch: () => Promise<void>;
  reset: () => void;
};

// Module-scope helpers — pure side-effect on the document; no hook state.
function triggerDownload(url: string, filename: string) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function triggerCsvDownload(csv: string, filename: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  triggerDownload(url, filename);
  // Revoke after a tick so the browser has a chance to consume the blob.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function useExportJobAF360(): UseExportJobAF360 {
  const [phase, setPhase] = useState<ExportPhase>({ kind: 'idle' });
  // Retain last-start context for retryFromBatch:
  const ctxRef = useRef<{
    jobId: string;
    plan: ExportBatchPlanItem[];
    exportLabel: string;
    totalBatches: number;
    totalLots: number;
    photosSoFar: number;
    nextBatchIdx: number;
  } | null>(null);

  const reset = useCallback(() => {
    setPhase({ kind: 'idle' });
    ctxRef.current = null;
  }, []);

  // Process batches starting from ctxRef.current.nextBatchIdx, sequential.
  const processBatches = useCallback(async () => {
    const ctx = ctxRef.current;
    if (!ctx) return;

    for (let i = ctx.nextBatchIdx; i < ctx.plan.length; i++) {
      const batchSpec = ctx.plan[i];
      ctx.nextBatchIdx = i;

      setPhase({
        kind: 'batch',
        batchNum: batchSpec.batchNum,
        totalBatches: ctx.totalBatches,
        sub: 'building',
      });

      let res: ExportBatchResponse;
      try {
        res = await api<ExportBatchResponse>(`/jobs/${ctx.jobId}/export-af360/batch`, {
          method: 'POST',
          body: JSON.stringify({
            batchNum: batchSpec.batchNum,
            lotIds: batchSpec.lotIds,
            exportLabel: ctx.exportLabel,
            totalBatches: ctx.totalBatches,
          }),
        });
      } catch (err) {
        setPhase({
          kind: 'error',
          message: err instanceof Error ? err.message : 'Batch failed',
          failedBatchNum: batchSpec.batchNum,
        });
        return;
      }

      setPhase({
        kind: 'batch',
        batchNum: batchSpec.batchNum,
        totalBatches: ctx.totalBatches,
        sub: 'downloading',
      });
      triggerDownload(res.downloadUrl, res.filename);
      ctx.photosSoFar += res.photoCount;
    }

    setPhase({
      kind: 'done',
      totalBatches: ctx.totalBatches,
      totalLots: ctx.totalLots,
      totalPhotos: ctx.photosSoFar,
    });
    ctxRef.current = null;
  }, []);

  const start = useCallback(async (jobId: string) => {
    setPhase({ kind: 'starting' });

    let initial: ExportStartResponse;
    try {
      initial = await api<ExportStartResponse>(`/jobs/${jobId}/export-af360/start`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
    } catch (err) {
      setPhase({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Failed to start export',
        failedBatchNum: null,
      });
      return;
    }

    triggerCsvDownload(initial.csv, initial.csvFilename);

    ctxRef.current = {
      jobId,
      plan: initial.batches,
      exportLabel: initial.exportLabel,
      totalBatches: initial.totalBatches,
      totalLots: initial.totalLots,
      photosSoFar: 0,
      nextBatchIdx: 0,
    };

    await processBatches();
  }, [processBatches]);

  const retryFromBatch = useCallback(async () => {
    // Resume from the failing batch (ctxRef preserved across the error state).
    if (!ctxRef.current) return;
    await processBatches();
  }, [processBatches]);

  return { phase, start, retryFromBatch, reset };
}
