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
  const [mirror, setMirror] = useState<FormMirrorEntry | null>(null);
  const [loaded, setLoaded] = useState(false);
  const pending = useRef<{ lotId: string; fields: Record<string, unknown> } | null>(null);
  const timer = useRef<number | null>(null);

  // Load on lotId change
  useEffect(() => {
    if (!lotId) {
      setMirror(null);
      setLoaded(true);
      return;
    }
    let cancelled = false;
    setLoaded(false);
    loadFormMirror(lotId).then((entry) => {
      if (!cancelled) {
        setMirror(entry ?? null);
        setLoaded(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [lotId]);

  // Flush any pending write on unmount
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
    setMirror(null);
  }, [lotId]);

  return { mirror, loaded, saveFields, clear };
}
