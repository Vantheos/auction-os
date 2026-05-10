export type LabelLot = {
  id: string;
  lotNumber: number;
  customerName: string;
  jobNumber: string;
};

const escape = (s: string) => s.replace(/[\^~\\]/g, ' ');
const truncate = (s: string, max: number) => (s.length <= max ? s : s.slice(0, max));

// Returns the trailing segment after the last "-" if present, else the full string.
// Used to fit job numbers like "2026-04-Smith-001" into ~10 chars on the label.
function jobTail(jobNumber: string): string {
  const i = jobNumber.lastIndexOf('-');
  return i >= 0 ? jobNumber.slice(i + 1) : jobNumber;
}

export async function renderZpl(lot: LabelLot, deployHost: string): Promise<string> {
  const qrPayload = `${deployHost.replace(/\/$/, '')}/lot/${lot.id}`;
  const customer = escape(truncate(lot.customerName, 20));
  const job = escape(truncate(jobTail(lot.jobNumber), 12));

  // 2" x 1" at 203 dpi → 406 x 203 px. QR on left at magnification 3 (sized
  // to fit URLs up to ~120 chars at QR Model 2 + Q error correction within
  // the 1" label height — the long Vercel preview URL is ~100 chars and
  // produces a ~0.78" QR at this magnification). Magnification 5 was the
  // original Phase 2 setting; it overflowed when bench-tested with the
  // real preview URL (1.25" QR exceeded the 1" height). Lot # + customer
  // + job tail occupy the right side starting at x=185 (just past the QR).
  return [
    '^XA',
    '^PW406',
    '^LL203',
    `^FO16,16^BQN,2,3^FDQA,${qrPayload}^FS`,
    `^FO185,20^A0N,40,40^FDLot ${lot.lotNumber}^FS`,
    `^FO185,72^A0N,22,22^FB220,1,0,L,0^FD${customer}^FS`,
    `^FO185,108^A0N,22,22^FB220,1,0,L,0^FD${job}^FS`,
    '^XZ',
    '',
  ].join('\n');
}
