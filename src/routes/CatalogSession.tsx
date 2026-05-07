// src/routes/CatalogSession.tsx
// /catalog/session?customer=&job= — the lot-in-progress screen.
// Composes LotInProgress + EndSessionConfirm modal + SaveSuccessSplash.
//
// State machine:
//   editing  → operator capturing/editing the current in-progress lot
//   ending   → end-session confirm modal open
//   advancing → save success splash showing, auto-advances to fresh lot

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCatalogSession } from '@/hooks/useCatalogSession';
import { LotInProgress } from '@/components/catalog/LotInProgress';
import { EndSessionConfirm } from '@/components/catalog/EndSessionConfirm';
import { SaveSuccessSplash } from '@/components/catalog/SaveSuccessSplash';

export function CatalogSession() {
  const navigate = useNavigate();
  const { customerId, jobId, lotId, endSession } = useCatalogSession();
  const [endOpen, setEndOpen] = useState(false);
  const [savedSplash, setSavedSplash] = useState<{ saved: number; next: number } | null>(null);
  // Count of lots completed (advanced past) in this session. Bumped by
  // LotInProgress on Next. The current in-progress lot — if any — is
  // surfaced separately by EndSessionConfirm via hasInProgressLot.
  const [savedCount, setSavedCount] = useState(0);
  const [busy, setBusy] = useState(false);

  if (!customerId || !jobId) {
    // No session — bounce back to picker
    navigate('/catalog', { replace: true });
    return null;
  }

  const handleEnd = () => setEndOpen(true);

  const handleDiscard = async () => {
    setBusy(true);
    await endSession(false);
    setBusy(false);
  };

  const handleKeep = async () => {
    setBusy(true);
    await endSession(true);
    setBusy(false);
  };

  return (
    <div className="relative">
      <LotInProgress onEndSession={handleEnd} onLotSaved={() => setSavedCount((c) => c + 1)} />
      <EndSessionConfirm
        open={endOpen}
        hasInProgressLot={!!lotId}
        savedCount={savedCount}
        onCancel={() => setEndOpen(false)}
        onDiscard={handleDiscard}
        onKeep={handleKeep}
        busy={busy}
      />
      {savedSplash && (
        <SaveSuccessSplash
          savedLotNumber={savedSplash.saved}
          nextLotNumber={savedSplash.next}
          onAdvance={() => setSavedSplash(null)}
        />
      )}
    </div>
  );
}
