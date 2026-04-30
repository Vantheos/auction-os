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

  // 2" x 1" at 203 dpi → 406 x 203 px. QR ~120px on left; lot # + customer + job on right.
  return [
    '^XA',
    '^PW406',
    '^LL203',
    `^FO16,16^BQN,2,5^FDQA,${qrPayload}^FS`,
    `^FO156,20^A0N,40,40^FDLot ${lot.lotNumber}^FS`,
    `^FO156,72^A0N,22,22^FB246,1,0,L,0^FD${customer}^FS`,
    `^FO156,108^A0N,22,22^FB246,1,0,L,0^FD${job}^FS`,
    '^XZ',
    '',
  ].join('\n');
}
