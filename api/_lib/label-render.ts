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
  // QR carries the full lot URL, so they're redundant on the label. The
  // 55x55 character cell is the practical max for square aspect with up
  // to 4-digit lot numbers in a 221-dot wide text area (4 × 55 = 220
  // dots; lot numbers are typically < 1000 but the design accommodates
  // 9999). Both rows start at x=185 so a 3-digit number sits directly
  // under the "Lot" label; a 4-digit number extends one cell past it.
  return [
    '^XA',
    '^PW406',
    '^LL203',
    `^FO16,16^BQN,2,3^FDQA,${qrPayload}^FS`,
    `^FO185,42^A0N,55,55^FDLot^FS`,
    `^FO185,107^A0N,55,55^FD${lot.lotNumber}^FS`,
    '^XZ',
    '',
  ].join('\n');
}
