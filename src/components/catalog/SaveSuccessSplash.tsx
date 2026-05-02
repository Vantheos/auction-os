// src/components/catalog/SaveSuccessSplash.tsx
// Brief 800ms confirmation between Next and the next in-progress screen.
// Per option-c-flow.jsx → SaveSuccessScreen mockup.

import { useEffect } from 'react';

type Props = {
  savedLotNumber: number;
  nextLotNumber: number;
  onAdvance: () => void;
  durationMs?: number;
};

export function SaveSuccessSplash({ savedLotNumber, nextLotNumber, onAdvance, durationMs = 800 }: Props) {
  useEffect(() => {
    const t = window.setTimeout(onAdvance, durationMs);
    return () => window.clearTimeout(t);
  }, [onAdvance, durationMs]);

  return (
    <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-wash p-6 gap-5">
      <div className="size-16 rounded-full bg-state-sold text-white flex items-center justify-center shadow-lg">
        <svg width="32" height="32" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 8l3 3 7-7" />
        </svg>
      </div>
      <div className="text-center">
        <div className="text-2xl font-bold text-text">Lot {savedLotNumber} saved</div>
        <div className="text-sm text-textDim mt-1">Photos uploading in background</div>
      </div>
      <div className="text-xs text-textFaint">
        Advancing to <b className="text-text font-mono tabular-nums">Lot {nextLotNumber}</b>…
      </div>
    </div>
  );
}
