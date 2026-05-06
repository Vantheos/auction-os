// src/hooks/useNow.ts
// React-idiomatic source of "the current time" for time-derived UI state.
// Built on useSyncExternalStore so the value can be read pure during render
// without violating react-hooks/purity or react-hooks/set-state-in-effect.
//
// Implementation: the snapshot is held in a ref so getSnapshot is
// referentially stable across renders that aren't triggered by a tick.
// The subscriber's interval is the only writer; it both updates the ref
// and calls back into React so the next render observes the new value.
// Returning Date.now() directly from getSnapshot causes infinite render
// loops because useSyncExternalStore compares snapshots between renders.
//
// Pass `active=false` when no time tick is needed — the subscribe returns
// a no-op cleanup and the snapshot stays at the mount-time value (cheap;
// no interval, no re-renders).
//
// Used by Phase 6's AI processing-lock staleness UI: a lock is treated as
// stale after 5 min and the banner needs to auto-clear without a server
// round-trip.

import { useRef, useSyncExternalStore } from 'react';

export function useNow(intervalMs: number, active: boolean): number {
  // useRef's initializer is evaluated every render but only the first
  // value is retained; subsequent calls are discarded. The "impurity"
  // here is the mount-time time read, which IS the desired semantic.
  // Lazy-init via `useRef<number | null>(null); if (ref.current === null) …`
  // would just shift the Date.now() call to a different render-time site
  // without changing the lint outcome.
  // eslint-disable-next-line react-hooks/purity
  const ref = useRef(Date.now());
  return useSyncExternalStore(
    (callback) => {
      if (!active) return () => {};
      const id = setInterval(() => {
        ref.current = Date.now();
        callback();
      }, intervalMs);
      return () => clearInterval(id);
    },
    () => ref.current,
    () => ref.current,
  );
}
