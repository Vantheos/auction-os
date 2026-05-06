// tests/lib/ai-compose-title.test.ts
import { describe, it, expect } from 'vitest';
import { composeTitle } from '../../src/lib/ai/compose';

const base = {
  brand: 'Stanley',
  briefDescription: 'FATMAX Adjustable Wrench Set',
  price: 120,
  quantity: 3,
  specialNotesCategory: 'None' as const,
};

describe('composeTitle', () => {
  it('happy path under 50 chars', () => {
    expect(composeTitle(base)).toBe('$120- 3x Stanley FATMAX Adjustable Wrench Set');
  });

  it('truncates brief_description to fit when needed', () => {
    const result = composeTitle({
      ...base,
      briefDescription: 'FATMAX 10-Piece Adjustable Wrench Set Heavy-Duty Chrome',
      specialNotesCategory: 'TOOL ONLY',
    });
    expect(result?.length).toBeLessThanOrEqual(50);
    expect(result).toMatch(/^\$120- 3x Stanley /);
    expect(result).toMatch(/ TOOL ONLY$/);
  });

  it('substitutes $$$ when price is null', () => {
    const result = composeTitle({ ...base, price: null });
    expect(result).toMatch(/^\$\$\$- 3x Stanley/);
  });

  it('skips brand when null', () => {
    const result = composeTitle({ ...base, brand: null });
    expect(result).toBe('$120- 3x FATMAX Adjustable Wrench Set');
  });

  it('skips brief_description when null', () => {
    const result = composeTitle({ ...base, briefDescription: null });
    expect(result).toBe('$120- 3x Stanley');
  });

  it('appends TOOL ONLY suffix uppercase', () => {
    const result = composeTitle({ ...base, specialNotesCategory: 'TOOL ONLY' });
    expect(result).toMatch(/ TOOL ONLY$/);
  });

  it('appends READ suffix uppercase', () => {
    const result = composeTitle({ ...base, specialNotesCategory: 'READ' });
    expect(result).toMatch(/ READ$/);
  });

  it('does NOT append CLOTHING or None to title', () => {
    expect(composeTitle({ ...base, specialNotesCategory: 'CLOTHING' })).not.toMatch(/CLOTHING/);
    expect(composeTitle({ ...base, specialNotesCategory: 'None' })).not.toMatch(/None/);
  });

  it('returns null when all useful slots are null', () => {
    expect(composeTitle({
      ...base, brand: null, briefDescription: null, price: null,
    })).toBeNull();
  });

  it('handles brand-only (brief null) plus suffix', () => {
    const result = composeTitle({
      ...base, briefDescription: null, specialNotesCategory: 'READ',
    });
    expect(result).toBe('$120- 3x Stanley READ');
  });

  it('formats price with 2 decimals when fractional', () => {
    const result = composeTitle({ ...base, price: 8.99 });
    expect(result).toMatch(/^\$8\.99-/);
  });

  it('drops trailing .00 for whole-dollar prices', () => {
    const result = composeTitle({ ...base, price: 120 });
    expect(result).toMatch(/^\$120-/);
  });

  it('truncates brand from right when even brand alone overflows', () => {
    const result = composeTitle({
      ...base,
      brand: 'X'.repeat(100),
      briefDescription: 'Y',
      specialNotesCategory: 'TOOL ONLY',
    });
    expect(result?.length).toBeLessThanOrEqual(50);
  });

  it('collapses adjacent spaces when brand+brief are both null with a TOOL ONLY suffix', () => {
    // fixedLeft = '$120- 3x ' (trailing space), composedMiddle = '',
    // fixedRight = ' TOOL ONLY' (leading space). Without the collapse step
    // the result would have a double space between "3x" and "TOOL ONLY".
    const result = composeTitle({
      ...base,
      brand: null,
      briefDescription: null,
      specialNotesCategory: 'TOOL ONLY',
    });
    expect(result).toBe('$120- 3x TOOL ONLY');
    expect(result).not.toMatch(/ {2,}/);
  });

  it('trims trailing space when there is no fixedRight suffix', () => {
    // fixedLeft = '$120- 3x ' (trailing space), composedMiddle = '',
    // fixedRight = ''. Result must not end with whitespace.
    const result = composeTitle({
      ...base,
      brand: null,
      briefDescription: null,
      specialNotesCategory: 'None',
    });
    expect(result).toBe('$120- 3x');
    expect(result).not.toMatch(/ $/);
  });
});
