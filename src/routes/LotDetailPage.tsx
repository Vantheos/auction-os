import { useParams } from 'react-router-dom';
import { useLot } from '@/hooks/useLots';
import { useRole } from '@/lib/auth';
import { LotDetail } from '@/components/lot/LotDetail';

export function LotDetailPage() {
  const { id } = useParams<{ id: string }>();
  const lotQ = useLot(id);
  const role = useRole();
  const isAdmin = role === 'admin';
  // All authenticated roles can edit non-state fields. Server enforces the
  // role/frozen-state policy; warehouse PATCH is allowed for non-state fields
  // (required by cataloging autosave) and rejected for state changes.
  const canEdit = !!role;

  return (
    <div className="min-h-[100dvh] bg-wash">
      <div className="max-w-2xl mx-auto p-4 sm:p-6">
        {lotQ.isLoading && <div className="text-sm text-textDim p-8 text-center">Loading…</div>}
        {lotQ.error && <div className="text-sm text-danger p-4">{(lotQ.error as Error).message}</div>}
        {lotQ.data && (
          <div className="rounded-lg border border-border bg-surfaceSolid p-4 sm:p-6">
            <LotDetail lot={lotQ.data} canEdit={canEdit} canDelete={isAdmin} />
          </div>
        )}
      </div>
    </div>
  );
}
