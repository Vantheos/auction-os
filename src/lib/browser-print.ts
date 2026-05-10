// src/lib/browser-print.ts
//
// Wire-format helpers for Zebra Browser Print's local HTTP API (v5+).
//
// Browser Print runs as a desktop app on the operator's workstation,
// listening on https://localhost:9101 by default. The /write endpoint
// requires the full device object (discovered via /available) plus the
// ZPL data, sent as JSON. Older v2/v3 versions accepted raw text on
// /write — this module targets v5+ only, which is what current Browser
// Print installers ship.
//
// Both useLabelPrint (single) and useBulkLabelPrint (loop) consume
// these helpers. The bulk hook discovers once before its loop and
// passes the device to each sendZpl call so we don't hit /available
// per-lot.

export type BrowserPrintDevice = {
  deviceType: string;
  uid: string;
  name: string;
  connection: string;
  version: number;
  provider: string;
  manufacturer: string;
};

type AvailableResponse = {
  printer?: BrowserPrintDevice[];
};

export const NO_PRINTER = 'NO_PRINTER';

function trimSlash(s: string): string {
  return s.replace(/\/$/, '');
}

export async function discoverPrinter(helperUrl: string): Promise<BrowserPrintDevice> {
  const r = await fetch(`${trimSlash(helperUrl)}/available`);
  if (!r.ok) throw new Error(`Browser Print /available returned ${r.status}`);
  const data = (await r.json()) as AvailableResponse;
  const printer = data.printer?.[0];
  if (!printer) throw new Error(NO_PRINTER);
  return printer;
}

export async function sendZpl(helperUrl: string, device: BrowserPrintDevice, zpl: string): Promise<void> {
  const r = await fetch(`${trimSlash(helperUrl)}/write`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ device, data: zpl }),
  });
  if (!r.ok) throw new Error(`Browser Print /write returned ${r.status}`);
}
