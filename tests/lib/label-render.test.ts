import { describe, it, expect } from 'vitest';
import { renderZpl, type LabelLot } from '../../api/_lib/label-render';

const SAMPLE: LabelLot = {
  id: '11111111-1111-1111-1111-111111111111',
  lotNumber: 13,
  customerName: 'Smith Estate',
  jobNumber: '2026-04-Smith-001',
};

describe('renderZpl', () => {
  it('returns ZPL starting with ^XA and ending with ^XZ', async () => {
    const zpl = await renderZpl(SAMPLE, 'https://example.com');
    expect(zpl.startsWith('^XA')).toBe(true);
    expect(zpl.trimEnd().endsWith('^XZ')).toBe(true);
  });
  it('contains the lot number', async () => {
    const zpl = await renderZpl(SAMPLE, 'https://example.com');
    expect(zpl).toContain('Lot 13');
  });
  it('contains the customer name', async () => {
    const zpl = await renderZpl(SAMPLE, 'https://example.com');
    expect(zpl).toContain('Smith Estate');
  });
  it('contains a QR field encoding the deploy host + lot id', async () => {
    const zpl = await renderZpl(SAMPLE, 'https://example.com');
    expect(zpl).toContain('https://example.com/lot/11111111-1111-1111-1111-111111111111');
  });
  it('uses last segment of job number when full triple is too long', async () => {
    const zpl = await renderZpl({ ...SAMPLE, jobNumber: '2026-04-VeryLongCustomerName-007' }, 'https://example.com');
    // last segment after final '-' should be present; full string need not be
    expect(zpl).toContain('007');
  });
  it('print width 406 and label length 203 for 2x1 inch at 203 dpi', async () => {
    const zpl = await renderZpl(SAMPLE, 'https://example.com');
    expect(zpl).toContain('^PW406');
    expect(zpl).toContain('^LL203');
  });
});
