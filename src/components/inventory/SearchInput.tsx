// src/components/inventory/SearchInput.tsx
// Debounced text input for the Inventory search field. Commits the
// trimmed value to the parent ~300 ms after the last keystroke so the
// list query (and URL) doesn't re-fire on every character. Follows the
// setTimeout-ref pattern already used in useFormMirror.
//
// The parent owns the canonical value (URL-driven). When that changes
// externally — navigation, Clear filters, deep link — we sync the
// local input to match. The local-then-sync split lets the user keep
// typing without their text getting clobbered mid-stroke by an
// external update from the same value they just produced.

import { useEffect, useRef, useState } from 'react';

const DEBOUNCE_MS = 300;

type Props = {
  value: string;
  onCommit: (next: string) => void;
  className?: string;
  placeholder?: string;
};

export function SearchInput({
  value,
  onCommit,
  className = '',
  placeholder = 'Search title or description…',
}: Props) {
  const [local, setLocal] = useState(value);
  const timer = useRef<number | null>(null);
  // Track the last value we committed so the external-sync effect can
  // tell "the parent just received my own commit" from "the parent
  // received an external change" (e.g., Clear filters).
  const lastCommitted = useRef(value);

  // External-sync: when the parent's value changes to something we
  // didn't just commit, replace the local input. Eats the case where
  // the parent receives our debounce commit and re-renders with the
  // same value — no clobber.
  useEffect(() => {
    if (value !== lastCommitted.current) {
      setLocal(value);
      lastCommitted.current = value;
    }
  }, [value]);

  // Debounced commit. Trim before comparing so trailing spaces don't
  // produce a no-op fetch.
  useEffect(() => {
    const trimmed = local.trim();
    if (trimmed === lastCommitted.current) return;
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      lastCommitted.current = trimmed;
      onCommit(trimmed);
    }, DEBOUNCE_MS);
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, [local, onCommit]);

  return (
    <input
      type="search"
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      placeholder={placeholder}
      className={`h-9 px-3 rounded-md border border-borderStrong bg-surfaceSolid text-sm placeholder:text-textFaint ${className}`}
      data-testid="inventory-search-input"
    />
  );
}
