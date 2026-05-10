export type LabelLot = {
  id: string;
  lotNumber: number;
  customerName: string;
  jobNumber: string;
};

const escape = (s: string) => s.replace(/[\^~\\]/g, ' ');
const truncate = (s: string, max: number) => (s.length <= max ? s : s.slice(0, max));

export async function renderZpl(lot: LabelLot, deployHost: string): Promise<string> {
  const qrPayload = `${deployHost.replace(/\/$/, '')}/lot/${lot.id}`;
  const customer = escape(truncate(lot.customerName, 20));
  // Phase 7: show the full job number, truncated to 30 chars, and let it
  // wrap up to 3 lines on the label. Earlier versions only printed the
  // trailing segment after the last "-" (e.g. "001"), but job numbers are
  // freeform operator entries with no structural guarantee, so the tail
  // alone isn't operationally meaningful — the lot number above already
  // disambiguates the lot itself. The QR encodes the full lot URL
  // regardless, so the printed text is fallback identification only.
  const job = escape(truncate(lot.jobNumber, 30));

  // 2" x 1" at 203 dpi → 406 x 203 px. QR on left at magnification 3 (sized
  // to fit URLs up to ~120 chars at QR Model 2 + Q error correction within
  // the 1" label height — the long Vercel preview URL is ~100 chars and
  // produces a ~0.78" QR at this magnification). Magnification 5 was the
  // original Phase 2 setting; it overflowed when bench-tested with the
  // real preview URL (1.25" QR exceeded the 1" height). Lot # + customer
  // + job text occupy the right side starting at x=185 (just past the QR).
  // Job line uses ^FB with 3-line max to wrap freeform job names; ZPL
  // wraps preferentially at spaces, then character-by-character.
  return [
    '^XA',
    '^PW406',
    '^LL203',
    `^FO16,16^BQN,2,3^FDQA,${qrPayload}^FS`,
    `^FO185,20^A0N,40,40^FDLot ${lot.lotNumber}^FS`,
    `^FO185,72^A0N,22,22^FB220,1,0,L,0^FD${customer}^FS`,
    `^FO185,108^A0N,22,22^FB220,3,0,L,0^FD${job}^FS`,
    '^XZ',
    '',
  ].join('\n');
}
