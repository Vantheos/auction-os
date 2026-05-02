// src/hooks/useFormMirror.ts
// Mirrors the in-progress lot's field state to IndexedDB on every keystroke
// (200ms debounce) so a tab close mid-edit doesn't lose typing made between
// the last server PATCH (1.5s autosave) and the close. Loads the mirror on
// mount so a fresh tab can prefill from local state if the server lot hasn't
// caught up yet.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  saveFormMirror,
  loadFormMirror,
  clearFormMirror,
  type FormMirrorEntry,
} from '@/lib/idb';

const DEBOUNCE_MS = 200;

export function useFormMirror(lotId: string | null): {
  mirror: FormMirrorEntry | null;
  loaded: boolean;
  saveFields: (fields: Record<string, unknown>) => void;
  clear: () => Promise<void>;
} {
  // Only state we keep is the result of the async IDB load — keyed by the
  // lotId we loaded for. The "null lotId" case is derived during render so
  // we never call setState in an effect just to reset.
  const [loaded, setLoaded] = useState<{ lotId: string; mirror: FormMirrorEntry | null } | null>(null);
  const pending = useRef<{ lotId: string; fields: Record<string, unknown> } | null>(null);
  const timer = useRef<number | null>(null);

  // Async-load the mirror when lotId becomes non-null. The setState in here
  // is a legitimate "external sync arrived" callback (not a state-reset on
  // prop change), so the rule allows it.
  useEffect(() => {
    if (!lotId) return;
    let cancelled = false;
    loadFormMirror(lotId).then((entry) => {
      if (!cancelled) setLoaded({ lotId, mirror: entry ?? null });
    });
    return () => { cancelled = true; };
  }, [lotId]);

  // Flush any pending IDB write when the consumer unmounts.
  useEffect(() => {
    return () => {
      if (timer.current !== null) {
        window.clearTimeout(timer.current);
        timer.current = null;
      }
      if (pending.current) {
        const { lotId: id, fields } = pending.current;
        void saveFormMirror(id, fields);
        pending.current = null;
      }
    };
  }, []);

  const saveFields = useCallback(
    (fields: Record<string, unknown>) => {
      if (!lotId) return;
      pending.current = { lotId, fields };
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        if (pending.current) {
          void saveFormMirror(pending.current.lotId, pending.current.fields);
          pending.current = null;
        }
        timer.current = null;
      }, DEBOUNCE_MS);
    },
    [lotId]
  );

  const clear = useCallback(async () => {
    if (!lotId) return;
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    pending.current = null;
    await clearFormMirror(lotId);
    setLoaded({ lotId, mirror: null });
  }, [lotId]);

  // Derive what consumers see:
  //   - Null lotId: no mirror, "loaded" trivially (nothing to load).
  //   - Mirror was loaded for the current lotId: return it.
  //   - lotId changed but the new mirror hasn't arrived yet: null + not-loaded.
  const mirror = lotId === null ? null : (loaded?.lotId === lotId ? loaded.mirror : null);
  const isLoaded = lotId === null || loaded?.lotId === lotId;

  return { mirror, loaded: isLoaded, saveFields, clear };
}
