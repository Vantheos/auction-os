// tests/client/hooks/useExportJobAF360.test.tsx
//
// Phase 5 Area 6 — covers the sequential orchestration:
//   - happy path (start → CSV download → N batch downloads → done)
//   - error path (one batch fails → exposes retryFromBatch)
//   - retry resumes from failed batch, not from scratch

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, waitFor } from '@testing-library/react';
import { useExportJobAF360 } from '@/hooks/useExportJobAF360';
import { renderHookWithProviders } from '../../helpers/render-with-providers';
import { mockApi, resetMockApi } from '../../helpers/mock-api';

vi.mock('@/lib/api', async () => ({
  api: (await import('../../helpers/mock-api')).apiMockImpl,
}));

// Capture every download trigger so we can assert order + content.
const downloads: Array<{ url: string; filename: string }> = [];

beforeEach(() => {
  resetMockApi();
  downloads.length = 0;

  // Stub URL.createObjectURL / revokeObjectURL with deterministic fakes.
  let n = 0;
  globalThis.URL.createObjectURL = vi.fn(() => `blob:fake-${++n}`);
  globalThis.URL.revokeObjectURL = vi.fn();

  // Patch HTMLAnchorElement.click to capture the synthetic download click.
  // The hook builds an <a> with download + href, then calls .click().
  const proto = HTMLAnchorElement.prototype as { click: () => void };
  const orig = proto.click;
  proto.click = function () {
    const a = this as HTMLAnchorElement;
    downloads.push({ url: a.href, filename: a.download });
    // Don't actually navigate — happy-dom would noop anyway, but this keeps
    // the side-effect surface clean.
  };
  // Restore after each test (vi.restoreAllMocks won't catch a manual patch)
  return () => { proto.click = orig; };
});

describe('useExportJobAF360 — happy path', () => {
  it('triggers CSV + N batch downloads in order', async () => {
    mockApi({
      'POST /jobs/job-1/export-af360/start': () => ({
        csv: 'LotNumber,Title\r\n1,A\r\n',
        csvFilename: 'JobExport-acme-001-2026-05-04.csv',
        batchSize: 100,
        totalBatches: 2,
        totalLots: 150,
        batches: [
          { batchNum: 1, lotIds: ['lot-1', 'lot-2'] },
          { batchNum: 2, lotIds: ['lot-3'] },
        ],
        exportLabel: 'JobExport-acme-001-2026-05-04',
      }),
      'POST /jobs/job-1/export-af360/batch': (ctx: { body: any }) => ({
        downloadUrl: `https://blob.example.com/batch-${ctx.body.batchNum}.zip`,
        expiresAt: '2026-05-05T00:00:00Z',
        batchNum: ctx.body.batchNum,
        totalBatches: ctx.body.totalBatches,
        filename: `JobExport-acme-001-2026-05-04-batch-${ctx.body.batchNum}-of-${ctx.body.totalBatches}.zip`,
        photoCount: 5,
      }),
    });

    const { result } = renderHookWithProviders(() => useExportJobAF360());

    await act(async () => {
      await result.current.start('job-1');
    });

    await waitFor(() => expect(result.current.phase.kind).toBe('done'));

    // First download should be the CSV (a blob: URL); next two are batch zips
    expect(downloads).toHaveLength(3);
    expect(downloads[0].filename).toBe('JobExport-acme-001-2026-05-04.csv');
    expect(downloads[1].filename).toBe('JobExport-acme-001-2026-05-04-batch-1-of-2.zip');
    expect(downloads[2].filename).toBe('JobExport-acme-001-2026-05-04-batch-2-of-2.zip');

    if (result.current.phase.kind === 'done') {
      expect(result.current.phase.totalBatches).toBe(2);
      expect(result.current.phase.totalLots).toBe(150);
      expect(result.current.phase.totalPhotos).toBe(10);
    }
  });
});

describe('useExportJobAF360 — error path', () => {
  it('halts on batch failure and exposes retryFromBatch with failed number', async () => {
    let batchCallCount = 0;
    mockApi({
      'POST /jobs/job-1/export-af360/start': () => ({
        csv: 'header\r\n',
        csvFilename: 'X.csv',
        batchSize: 100,
        totalBatches: 3,
        totalLots: 200,
        batches: [
          { batchNum: 1, lotIds: ['l1'] },
          { batchNum: 2, lotIds: ['l2'] },
          { batchNum: 3, lotIds: ['l3'] },
        ],
        exportLabel: 'X',
      }),
      'POST /jobs/job-1/export-af360/batch': (ctx: { body: any }) => {
        batchCallCount++;
        if (ctx.body.batchNum === 2) {
          throw new Error('EXPORT_FAILED: photo not found');
        }
        return {
          downloadUrl: `https://blob.example.com/b${ctx.body.batchNum}.zip`,
          expiresAt: '2026-05-05T00:00:00Z',
          batchNum: ctx.body.batchNum,
          totalBatches: 3,
          filename: `b${ctx.body.batchNum}.zip`,
          photoCount: 1,
        };
      },
    });

    const { result } = renderHookWithProviders(() => useExportJobAF360());

    await act(async () => {
      await result.current.start('job-1');
    });

    await waitFor(() => expect(result.current.phase.kind).toBe('error'));
    if (result.current.phase.kind === 'error') {
      expect(result.current.phase.failedBatchNum).toBe(2);
      expect(result.current.phase.message).toContain('EXPORT_FAILED');
    }

    // First batch downloaded, second errored, third never attempted
    expect(downloads.length).toBeGreaterThanOrEqual(2); // CSV + batch 1
    expect(batchCallCount).toBe(2); // batch 1 + batch 2 (failure); batch 3 not yet
  });

  it('retryFromBatch resumes at the failed batch (not from scratch)', async () => {
    const batchCalls: number[] = [];
    let failOnBatch2 = true;
    mockApi({
      'POST /jobs/job-1/export-af360/start': () => ({
        csv: 'h\r\n',
        csvFilename: 'X.csv',
        batchSize: 100,
        totalBatches: 3,
        totalLots: 200,
        batches: [
          { batchNum: 1, lotIds: ['l1'] },
          { batchNum: 2, lotIds: ['l2'] },
          { batchNum: 3, lotIds: ['l3'] },
        ],
        exportLabel: 'X',
      }),
      'POST /jobs/job-1/export-af360/batch': (ctx: { body: any }) => {
        batchCalls.push(ctx.body.batchNum);
        if (ctx.body.batchNum === 2 && failOnBatch2) {
          throw new Error('transient');
        }
        return {
          downloadUrl: `https://blob.example.com/b${ctx.body.batchNum}.zip`,
          expiresAt: '2026-05-05T00:00:00Z',
          batchNum: ctx.body.batchNum,
          totalBatches: 3,
          filename: `b${ctx.body.batchNum}.zip`,
          photoCount: 1,
        };
      },
    });

    const { result } = renderHookWithProviders(() => useExportJobAF360());

    await act(async () => { await result.current.start('job-1'); });
    await waitFor(() => expect(result.current.phase.kind).toBe('error'));
    expect(batchCalls).toEqual([1, 2]); // failed at 2

    // Stop failing; retry should pick up from batch 2
    failOnBatch2 = false;
    await act(async () => { await result.current.retryFromBatch(); });

    await waitFor(() => expect(result.current.phase.kind).toBe('done'));
    // Batch 1 should NOT have been called again
    expect(batchCalls).toEqual([1, 2, 2, 3]);
  });
});

describe('useExportJobAF360 — start failure', () => {
  it('halts before any batch when /start rejects', async () => {
    mockApi({
      'POST /jobs/job-1/export-af360/start': () => {
        throw new Error('SELLER_CODE_REQUIRED');
      },
    });

    const { result } = renderHookWithProviders(() => useExportJobAF360());

    await act(async () => { await result.current.start('job-1'); });
    await waitFor(() => expect(result.current.phase.kind).toBe('error'));
    if (result.current.phase.kind === 'error') {
      expect(result.current.phase.failedBatchNum).toBeNull();
      expect(result.current.phase.message).toContain('SELLER_CODE_REQUIRED');
    }
    expect(downloads).toHaveLength(0); // CSV never triggered
  });
});
