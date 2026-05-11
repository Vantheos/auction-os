import { describe, it, expect } from 'vitest';
import { renderZpl, type LabelLot } from '../../api/_lib/label-render';

const SAMPLE: LabelLot = {
  id: '11111111-1111-1111-1111-111111111111',
  lotNumber: 13,
};

describe('renderZpl', () => {
  it('returns ZPL starting with ^XA and ending with ^XZ', async () => {
    const zpl = await renderZpl(SAMPLE, 'https://example.com');
    expect(zpl.startsWith('^XA')).toBe(true);
    expect(zpl.trimEnd().endsWith('^XZ')).toBe(true);
  });

  // Phase 7 final round: label is now QR + "Lot" word + lot number only.
  // Customer name + job number lines were dropped at the customer's request.
  it('renders the "Lot" word on its own line', async () => {
    const zpl = await renderZpl(SAMPLE, 'https://example.com');
    expect(zpl).toContain('^FDLot^FS');
  });

  it('renders the lot number on its own line, not embedded with "Lot"', async () => {
    const zpl = await renderZpl(SAMPLE, 'https://example.com');
    expect(zpl).toContain('^FD13^FS');
    expect(zpl).not.toContain('Lot 13');
  });

  it('uses the 55x55 character cell on both rows', async () => {
    // Cell width sets spacing but A0N glyphs render proportionally inside,
    // so 4-digit numbers fit comfortably despite 4 × 55 = 220 dots looking
    // tight against the 221-dot label-edge math.
    const zpl = await renderZpl(SAMPLE, 'https://example.com');
    const matches = zpl.match(/\^A0N,55,55/g);
    expect(matches?.length).toBe(2);
  });

  it('does not include any customer or job text on the label', async () => {
    const zpl = await renderZpl(SAMPLE, 'https://example.com');
    // No ^FB field-block directives any more (no wrapped lines).
    expect(zpl).not.toContain('^FB');
  });

  it('contains a QR field encoding the deploy host + lot id', async () => {
    const zpl = await renderZpl(SAMPLE, 'https://example.com');
    expect(zpl).toContain('https://example.com/lot/11111111-1111-1111-1111-111111111111');
  });

  it('print width 406 and label length 203 for 2x1 inch at 203 dpi', async () => {
    const zpl = await renderZpl(SAMPLE, 'https://example.com');
    expect(zpl).toContain('^PW406');
    expect(zpl).toContain('^LL203');
  });

  // Pin the QR magnification choice. Phase 7 bench testing surfaced that
  // magnification 5 (the Phase 2 default) overflowed the 1" label height
  // when encoding the long Vercel preview URL. Magnification 3 keeps the
  // QR within ~0.8" for URLs up to ~120 chars at Model 2 + Q error
  // correction. If you need to bump this, re-verify against a real label
  // print with the longest expected deploy host first.
  it('uses QR magnification 3 to fit long URLs within the 1" label height', async () => {
    const zpl = await renderZpl(SAMPLE, 'https://example.com');
    expect(zpl).toContain('^BQN,2,3');
  });
});
