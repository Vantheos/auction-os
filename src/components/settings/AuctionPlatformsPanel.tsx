// src/components/settings/AuctionPlatformsPanel.tsx
//
// Phase 5 Area 7 — Settings → Auction Platforms read-only panel.
// v1 ships one platform (AF360 / HiBid). Multi-platform support is v2:
// at that point this panel grows from read-only to add/edit, and the
// AF360_HIBID const moves into a DB table. For now: pure display from
// the const.

import { useState } from 'react';
import { AF360_HIBID } from '@/lib/exporters/af360';

export function AuctionPlatformsPanel() {
  const [open, setOpen] = useState(false);
  return (
    <section className="rounded-lg border border-border bg-surfaceSolid p-4 space-y-4">
      <div>
        <h2 className="text-base font-semibold text-text">Auction Platforms</h2>
        <p className="text-sm text-textDim mt-1">
          The auction platform that exported jobs target. v1 ships with one platform; additional platforms can be added in a future release.
        </p>
      </div>

      <div className="rounded-md border border-border bg-surfaceAlt p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-text">{AF360_HIBID.name}</p>
            <p className="text-xs text-textDim">{AF360_HIBID.description}</p>
          </div>
          <span className="text-xs px-2 py-0.5 rounded-pill bg-success-bg text-success">
            Default platform
          </span>
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="text-xs text-textDim hover:underline"
        >
          {open ? '▾ Hide field mapping' : '▸ Show field mapping'}
        </button>

        {open && (
          <div className="rounded-md bg-surfaceSolid border border-border overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-surfaceAlt">
                <tr>
                  <th className="text-left px-3 py-1.5 font-semibold text-textDim">CSV column</th>
                  <th className="text-left px-3 py-1.5 font-semibold text-textDim">Source</th>
                  <th className="text-left px-3 py-1.5 font-semibold text-textDim">Notes</th>
                </tr>
              </thead>
              <tbody>
                {AF360_HIBID.fieldMapping.map((m) => (
                  <tr key={m.header} className="border-t border-border">
                    <td className="px-3 py-1.5 font-mono">{m.header}</td>
                    <td className="px-3 py-1.5 font-mono text-textDim">{m.source}</td>
                    <td className="px-3 py-1.5 text-textDim">{m.notes ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
