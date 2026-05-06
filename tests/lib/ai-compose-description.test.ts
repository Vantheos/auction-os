// tests/lib/ai-compose-description.test.ts
import { describe, it, expect } from 'vitest';
import { composeDescription } from '../../src/lib/ai/compose';

const base = {
  body: 'Heavy-duty wrench set in original case.',
  specialNotesCategory: 'None' as const,
  specialNotesText: null,
  untested: false,
};

describe('composeDescription', () => {
  it('passes through plain body unchanged', () => {
    expect(composeDescription(base)).toBe('Heavy-duty wrench set in original case.');
  });

  it('appends CLOTHING - size when category=CLOTHING and size present', () => {
    expect(composeDescription({
      ...base, specialNotesCategory: 'CLOTHING', specialNotesText: 'L',
    })).toBe('Heavy-duty wrench set in original case. CLOTHING - L');
  });

  it('appends UNTESTED when untested=true', () => {
    expect(composeDescription({ ...base, untested: true }))
      .toBe('Heavy-duty wrench set in original case. UNTESTED');
  });

  it('appends both suffixes (defensive — should not co-occur in real life)', () => {
    expect(composeDescription({
      ...base, specialNotesCategory: 'CLOTHING', specialNotesText: 'XL', untested: true,
    })).toBe('Heavy-duty wrench set in original case. CLOTHING - XL UNTESTED');
  });

  it('skips CLOTHING suffix defensively when size is null', () => {
    expect(composeDescription({
      ...base, specialNotesCategory: 'CLOTHING', specialNotesText: null,
    })).toBe('Heavy-duty wrench set in original case.');
  });

  it('returns null when body is null', () => {
    expect(composeDescription({ ...base, body: null })).toBeNull();
  });

  it('returns null when body is empty string', () => {
    expect(composeDescription({ ...base, body: '' })).toBeNull();
  });

  it('returns null when body is whitespace-only', () => {
    expect(composeDescription({ ...base, body: '   ' })).toBeNull();
  });

  it('truncates body with ellipsis when over 500 total chars', () => {
    const long = 'A'.repeat(600);
    const result = composeDescription({ ...base, body: long, untested: true });
    expect(result?.length).toBeLessThanOrEqual(500);
    expect(result).toMatch(/UNTESTED$/);
    expect(result).toMatch(/…/);
  });

  it('preserves suffixes when truncating', () => {
    const long = 'B'.repeat(600);
    const result = composeDescription({
      ...base, body: long, specialNotesCategory: 'CLOTHING', specialNotesText: 'S',
    });
    expect(result).toMatch(/CLOTHING - S$/);
    expect(result?.length).toBeLessThanOrEqual(500);
  });

  it('handles exact 500-char body with no suffix', () => {
    const exactly500 = 'C'.repeat(500);
    expect(composeDescription({ ...base, body: exactly500 })).toBe(exactly500);
  });
});
