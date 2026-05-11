export type LabelLot = {
  id: string;
  lotNumber: number;
};

export async function renderZpl(lot: LabelLot, deployHost: string): Promise<string> {
  const qrPayload = `${deployHost.replace(/\/$/, '')}/lot/${lot.id}`;

  // 2" x 1" at 203 dpi → 406 x 203 px. QR on left at magnification 3 (sized
  // to fit URLs up to ~120 chars at QR Model 2 + Q error correction within
  // the 1" label height — the long Vercel preview URL is ~100 chars and
  // produces a ~0.78" QR at this magnification).
  //
  // Right side carries only the lot number, in two left-aligned rows:
  // "Lot" on top and the number below. Customer name + job number lines
  // were removed at the customer's request (Phase 7 final round) — the
  // QR carries the full lot URL, so they're redundant on the label.
  //
  // Font A0N at 55x55: visually substantial without crowding. The cell
  // width sets character spacing but A0N glyphs render proportionally
  // inside the cell, so the actual rendered width of "Lot 9999" is
  // narrower than 4 × 55 = 220 dots — bench-tested with comfortable
  // margin to the right edge. Lot numbers are typically < 1000; for
  // 3-digit cases "Lot" and the number sit cleanly under one another.
  // For the rare 4-digit case the extra digit extends one cell past
  // "Lot" — accepted by the customer.
  //
  // FO x=240 indents the right-side text by ~one cell width from the
  // QR's right edge (~x=175) — visual breathing room between QR and text.
  return [
    '^XA',
    '^PW406',
    '^LL203',
    `^FO16,16^BQN,2,3^FDQA,${qrPayload}^FS`,
    `^FO240,42^A0N,55,55^FDLot^FS`,
    `^FO240,107^A0N,55,55^FD${lot.lotNumber}^FS`,
    '^XZ',
    '',
  ].join('\n');
}
