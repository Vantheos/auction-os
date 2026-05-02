// src/hooks/useCatalogSession.ts
// Session state for the mobile cataloging flow. Customer + job come from
// URL params (so refreshes preserve them). The current in-progress lotId
// is component state — it's null until the first photo is captured (which
// is when the server creates the lot row). Advance to next lot resets
// lotId to null; the next capture creates a new lot row.

import { useCallback, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { addToQueue } from '@/lib/upload-processor';
import { clearFormMirror } from '@/lib/idb';
import type { CreateLotRequest, CreateLotResponse, LotDTO } from '@shared/types';

export type CatalogSession = {
  customerId: string | null;
  jobId: string | null;
  lotId: string | null;
  lotNumber: number | null;
  setLot: (id: string, lotNumber: number) => void;
  advance: () => void;
  discardCurrent: () => Promise<void>;
  endSession: (keep: boolean) => Promise<void>;
  captureFirst: (blob: Blob, sessionDefaults?: Partial<CreateLotRequest>) => Promise<{ lotId: string; lotNumber: number; photoId: string }>;
  isCapturingFirst: boolean;
};

export function useCatalogSession(): CatalogSession {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const customerId = params.get('customer');
  const jobId = params.get('job');

  const [lotId, setLotId] = useState<string | null>(null);
  const [lotNumber, setLotNumber] = useState<number | null>(null);

  const setLot = useCallback((id: string, n: number) => {
    setLotId(id);
    setLotNumber(n);
  }, []);

  const advance = useCallback(() => {
    setLotId(null);
    setLotNumber(null);
  }, []);

  const discardCurrent = useCallback(async () => {
    if (!lotId) return;
    try {
      await api(`/lots/${lotId}`, { method: 'DELETE' });
    } catch (e) {
      console.error('discardCurrent failed', e);
    }
    await clearFormMirror(lotId);
    queryClient.invalidateQueries({ queryKey: ['lots-infinite'] });
    setLotId(null);
    setLotNumber(null);
  }, [lotId, queryClient]);

  const endSession = useCallback(async (keep: boolean) => {
    if (!keep) await discardCurrent();
    navigate('/catalog');
  }, [discardCurrent, navigate]);

  // Atomic first-photo capture: creates the lot row + first lot_photo row +
  // returns the signed upload URL. Client enqueues the upload immediately so
  // the byte transfer happens in background while the UI shows the local blob.
  const createWithFirstPhoto = useMutation({
    mutationFn: async ({ blob, sessionDefaults }: { blob: Blob; sessionDefaults?: Partial<CreateLotRequest> }) => {
      if (!jobId) throw new Error('No job in session');
      const body: CreateLotRequest = {
        jobId,
        ...sessionDefaults,
        firstPhoto: { displayOrder: 1 },
      };
      const created = await api<CreateLotResponse>('/lots', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      if (!created.firstPhoto) throw new Error('Server did not return firstPhoto');
      // Enqueue the byte transfer; the processor flips status to uploaded on success.
      await addToQueue({
        photoId: created.firstPhoto.id,
        lotId: created.id,
        blob,
        uploadUrl: created.firstPhoto.uploadUrl,
        storagePath: created.firstPhoto.storagePath,
        retries: 0,
        createdAt: Date.now(),
      });
      return { lotId: created.id, lotNumber: created.lotNumber ?? 0, photoId: created.firstPhoto.id };
    },
    onSuccess: ({ lotId: id, lotNumber: n }) => {
      setLot(id, n);
      queryClient.invalidateQueries({ queryKey: ['lots-infinite'] });
    },
  });

  const captureFirst = useCallback(
    (blob: Blob, sessionDefaults?: Partial<CreateLotRequest>) =>
      createWithFirstPhoto.mutateAsync({ blob, sessionDefaults }),
    [createWithFirstPhoto]
  );

  return {
    customerId,
    jobId,
    lotId,
    lotNumber,
    setLot,
    advance,
    discardCurrent,
    endSession,
    captureFirst,
    isCapturingFirst: createWithFirstPhoto.isPending,
  };
}

/**
 * For subsequent photos (lot already exists). Returns a mutate function that
 * POSTs to /api/lots/[id]/photos and enqueues the upload.
 */
export function useCapturePhoto(lotId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (blob: Blob) => {
      if (!lotId) throw new Error('No lot in session');
      const created = await api<{
        id: string; lotId: string; storagePath: string; displayOrder: number;
        status: 'pending'; uploadUrl: string; token: string;
      }>(`/lots/${lotId}/photos`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      await addToQueue({
        photoId: created.id,
        lotId: created.lotId,
        blob,
        uploadUrl: created.uploadUrl,
        storagePath: created.storagePath,
        retries: 0,
        createdAt: Date.now(),
      });
      return created;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lot-photos', lotId] });
    },
  });
}

/**
 * Field-update mutation for the in-progress lot. Used by the cataloging
 * form's autosave path. Caller is responsible for debouncing (1.5s per spec).
 */
export function useUpdateLotFields(lotId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (fields: Partial<LotDTO>) => {
      if (!lotId) throw new Error('No lot');
      return api<LotDTO>(`/lots/${lotId}`, {
        method: 'PATCH',
        body: JSON.stringify(fields),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lot', lotId] });
    },
  });
}
